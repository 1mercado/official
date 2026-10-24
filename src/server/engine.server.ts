import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { credits, members } from '../../db/schema.js'
import type { Plan } from '@/lib/plan'
import { selectRows } from './members.server'
import { loadPlan } from './plan.server'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type Node = {
  id: number
  username: string
  parentId: number | null
  side: 'left' | 'right' | null
  sponsorId: number | null
  confirmed: boolean
  isActive: boolean
  activatedAt: number
  eligible: boolean
}

const ENGINE_LOCK = 1_998_001
const INSERT_CHUNK = 1000

/**
 * Runs the compensation plan inside one transaction, serialised by an advisory lock:
 *  1. activates confirmed members with enough paid direct referrals,
 *  2. credits ₱X to every active upline account for each newly active account (respecting the cap),
 *     and back-fills newly active accounts for active accounts already below them,
 *  3. tops up matching bonuses (left+right active pairs within N levels).
 * Every credit carries a unique source key, so re-running is always safe.
 * `recheck` lists members whose eligibility changed for another reason (e.g. unsuspended).
 */
export async function runEngine(recheck: number[] = []) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ENGINE_LOCK})`)
    const plan = await loadPlan(tx)
    return applyPlan(tx, plan, recheck)
  })
}

async function applyPlan(tx: Tx, plan: Plan, recheck: number[]) {
  const rows = await tx
    .select({
      id: members.id,
      username: members.username,
      parentId: members.parentId,
      side: members.side,
      sponsorId: members.sponsorId,
      entryStatus: members.entryStatus,
      isActive: members.isActive,
      isSuspended: members.isSuspended,
      activatedAt: members.activatedAt,
    })
    .from(members)

  const nodes = new Map<number, Node>()
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      username: r.username,
      parentId: r.parentId,
      side: r.side,
      sponsorId: r.sponsorId,
      confirmed: r.entryStatus === 'confirmed',
      isActive: r.isActive,
      activatedAt: r.activatedAt?.getTime() ?? 0,
      eligible: r.isActive && !r.isSuspended,
    })
  }

  // 1. Activation
  const paidDirects = new Map<number, number>()
  for (const n of nodes.values()) {
    if (n.confirmed && n.sponsorId != null)
      paidDirects.set(n.sponsorId, (paidDirects.get(n.sponsorId) ?? 0) + 1)
  }
  const suspended = new Set(rows.filter((r) => r.isSuspended).map((r) => r.id))
  const now = Date.now()
  const newlyActive: Node[] = []
  for (const n of nodes.values()) {
    if (
      !n.isActive &&
      n.confirmed &&
      !suspended.has(n.id) &&
      (paidDirects.get(n.id) ?? 0) >= plan.requiredDirects
    ) {
      n.isActive = true
      n.eligible = true
      n.activatedAt = now + newlyActive.length // keeps a stable order within this run
      newlyActive.push(n)
    }
  }
  for (let i = 0; i < newlyActive.length; i += INSERT_CHUNK) {
    const ids = newlyActive.slice(i, i + INSERT_CHUNK).map((n) => n.id)
    await tx
      .update(members)
      .set({ isActive: true, activatedAt: new Date(now) })
      .where(inArray(members.id, ids))
  }

  const children = new Map<number, { left?: Node; right?: Node }>()
  for (const n of nodes.values()) {
    if (n.parentId == null || !n.side) continue
    const c = children.get(n.parentId) ?? {}
    c[n.side] = n
    children.set(n.parentId, c)
  }

  // Receivers to process: newly active, rechecked, and every ancestor of a newly active account.
  const receivers = new Set<number>()
  const newIds = new Set(newlyActive.map((n) => n.id))
  const recheckIds = new Set(recheck)
  for (const id of [...newIds, ...recheck]) {
    receivers.add(id)
    let p = nodes.get(id)?.parentId
    while (p != null) {
      receivers.add(p)
      p = nodes.get(p)?.parentId ?? null
    }
  }
  const eligibleReceivers = [...receivers].filter(
    (id) => nodes.get(id)?.eligible,
  )
  if (eligibleReceivers.length === 0)
    return { activated: newlyActive.length, credited: 0 }

  // Existing credit counts for the receivers
  const counts = new Map<number, { active: number; matching: number }>()
  for (let i = 0; i < eligibleReceivers.length; i += INSERT_CHUNK) {
    const ids = eligibleReceivers.slice(i, i + INSERT_CHUNK)
    const res = await tx
      .select({
        memberId: credits.memberId,
        type: credits.type,
        n: sql<number>`count(*)::int`,
      })
      .from(credits)
      .where(
        and(
          inArray(credits.memberId, ids),
          inArray(credits.type, ['active', 'matching']),
        ),
      )
      .groupBy(credits.memberId, credits.type)
    for (const r of res) {
      const c = counts.get(r.memberId) ?? { active: 0, matching: 0 }
      if (r.type === 'active') c.active = r.n
      else c.matching = r.n
      counts.set(r.memberId, c)
    }
  }

  const maxActiveCredits =
    plan.perActiveAccount > 0
      ? Math.floor(plan.earningCap / plan.perActiveAccount)
      : 0
  const inserts: (typeof credits.$inferInsert)[] = []
  const stamp = new Date(now)

  for (const id of eligibleReceivers) {
    const receiver = nodes.get(id)!
    const have = counts.get(id) ?? { active: 0, matching: 0 }

    // 2. Active-account credits: the candidates are this account's active descendants.
    let room = maxActiveCredits - have.active
    if (room > 0 && plan.perActiveAccount > 0) {
      const backfill = newIds.has(id) || recheckIds.has(id)
      const candidates: Node[] = []
      const stack = [id]
      while (stack.length) {
        const c = children.get(stack.pop()!)
        for (const child of [c?.left, c?.right]) {
          if (!child) continue
          stack.push(child.id)
          if (
            child.eligible &&
            (backfill || newIds.has(child.id) || recheckIds.has(child.id))
          )
            candidates.push(child)
        }
      }
      candidates.sort((a, b) => a.activatedAt - b.activatedAt || a.id - b.id)
      for (const src of candidates) {
        if (room <= 0) break
        inserts.push({
          memberId: id,
          type: 'active',
          sourceKey: `active:${src.id}`,
          sourceMemberId: src.id,
          description: `Active account · ${src.username}`,
          amount: plan.perActiveAccount,
          createdAt: stamp,
        })
        room--
      }
    }

    // 3. Matching bonus: pairs = min(active left, active right) within the level limit.
    if (plan.matchingBonus > 0 && plan.matchingLevels > 0) {
      const c = children.get(receiver.id)
      const pairs = Math.min(
        countActive(c?.left, plan.matchingLevels, children),
        countActive(c?.right, plan.matchingLevels, children),
      )
      for (let n = have.matching + 1; n <= pairs; n++) {
        inserts.push({
          memberId: id,
          type: 'matching',
          sourceKey: `pair:${n}`,
          description: `Matching bonus · pair ${n}`,
          amount: plan.matchingBonus,
          createdAt: stamp,
        })
      }
    }
  }

  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    await tx
      .insert(credits)
      .values(inserts.slice(i, i + INSERT_CHUNK))
      .onConflictDoNothing({ target: [credits.memberId, credits.sourceKey] })
  }
  return { activated: newlyActive.length, credited: inserts.length }
}

function countActive(
  root: Node | undefined,
  levels: number,
  children: Map<number, { left?: Node; right?: Node }>,
) {
  if (!root) return 0
  let total = 0
  let frontier: Node[] = [root]
  for (let level = 1; level <= levels && frontier.length; level++) {
    const next: Node[] = []
    for (const n of frontier) {
      if (n.eligible) total++
      const c = children.get(n.id)
      if (c?.left) next.push(c.left)
      if (c?.right) next.push(c.right)
    }
    frontier = next
  }
  return total
}

/** Wallet numbers for one member: lifetime credits, cap usage, and what is free to withdraw. */
export async function walletSummary(
  memberId: number,
  plan: Plan,
  executor: Pick<typeof db, 'execute'> = db,
) {
  const dayStart = manilaDayStart()
  const result = await selectRows<{
    earned: number
    capped: number
    matching: number
    adjustments: number
    withdrawn: number
    paid: number
    pending: number
    today: number
  }>(
    executor,
    sql`
    select
      coalesce((select sum(amount) from credits where member_id = ${memberId}), 0)::int as earned,
      coalesce((select sum(amount) from credits where member_id = ${memberId} and type = 'active'), 0)::int as capped,
      coalesce((select sum(amount) from credits where member_id = ${memberId} and type = 'matching'), 0)::int as matching,
      coalesce((select sum(amount) from credits where member_id = ${memberId} and type = 'adjustment'), 0)::int as adjustments,
      coalesce((select sum(amount) from withdrawals where member_id = ${memberId} and status <> 'rejected'), 0)::int as withdrawn,
      coalesce((select sum(amount) from withdrawals where member_id = ${memberId} and status = 'paid'), 0)::int as paid,
      coalesce((select sum(amount) from withdrawals where member_id = ${memberId} and status in ('pending', 'approved')), 0)::int as pending,
      coalesce((select sum(amount) from withdrawals where member_id = ${memberId} and status <> 'rejected' and created_at >= ${dayStart.toISOString()}), 0)::int as today
  `,
  )
  const r = result[0]
  const cappedEarned = Math.min(r.capped, plan.earningCap)
  return {
    earned: r.earned,
    activeEarned: r.capped,
    matchingEarned: r.matching,
    adjustments: r.adjustments,
    cappedEarned,
    capProgress:
      plan.earningCap > 0 ? Math.min(r.capped / plan.earningCap, 1) : 0,
    balance: r.earned - r.withdrawn,
    withdrawn: r.withdrawn,
    paidOut: r.paid,
    pendingOut: r.pending,
    remainingToday: Math.max(plan.dailyWithdrawalLimit - r.today, 0),
  }
}

export type WalletSummary = Awaited<ReturnType<typeof walletSummary>>

/** Midnight in Manila (UTC+8, no daylight saving) for the daily withdrawal limit. */
export function manilaDayStart(at = new Date()) {
  const offset = 8 * 3_600_000
  const day = 86_400_000
  return new Date(Math.floor((at.getTime() + offset) / day) * day - offset)
}

export async function memberById(id: number) {
  const [m] = await db.select().from(members).where(eq(members.id, id)).limit(1)
  return m ?? null
}
