import { randomBytes } from 'node:crypto'

import { getRequestUrl } from '@tanstack/react-start/server'
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { members, payoutAccounts } from '../../db/schema.js'
import type { Member, PayoutAccount } from '@/lib/types'
import { isSuperAdmin, newMemberCode, type MemberRow } from './auth.server'
import { redeemedEntry } from './codes.server'

/** Runs raw SQL and returns typed rows (the driver's own result type doesn't resolve here). */
export async function selectRows<T>(
  executor: Pick<typeof db, 'execute'>,
  query: SQL,
): Promise<T[]> {
  const res = (await executor.execute(query)) as unknown as { rows: T[] }
  return res.rows
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = Pick<typeof db, 'execute' | 'select'>

/** Serialises all tree placements so two sign-ups never race for the same open slot. */
const PLACEMENT_LOCK = 1_998_002

export async function lockPlacement(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${PLACEMENT_LOCK})`)
}

export function toMember(m: MemberRow): Member {
  return {
    id: m.id,
    memberCode: m.memberCode,
    username: m.username,
    fullName: m.fullName,
    email: m.email,
    mobile: m.mobile,
    city: m.city,
    entryStatus: m.entryStatus,
    entryReference: m.entryReference,
    isActive: m.isActive,
    isAdmin: isSuperAdmin(m),
    createdAt: m.createdAt.toISOString(),
  }
}

export function requestOrigin() {
  return getRequestUrl().origin
}

export async function payoutFor(
  memberId: number,
  executor: Executor = db,
): Promise<PayoutAccount | null> {
  const [p] = await executor
    .select()
    .from(payoutAccounts)
    .where(eq(payoutAccounts.memberId, memberId))
    .limit(1)
  return p
    ? {
        method: p.method,
        accountName: p.accountName,
        accountNumber: p.accountNumber,
        bankName: p.bankName,
      }
    : null
}

export function describePayout(
  p: Pick<PayoutAccount, 'method' | 'accountNumber' | 'bankName'>,
) {
  return p.method === 'Bank'
    ? `${p.bankName ?? 'Bank'} · ${p.accountNumber}`
    : `${p.method} · ${p.accountNumber}`
}

/** True when `nodeId` is `ancestorId` itself or sits anywhere below it in the binary tree. */
export async function isInSubtree(
  ancestorId: number,
  nodeId: number,
  executor: Executor = db,
) {
  if (ancestorId === nodeId) return true
  const res = await selectRows<{ found: boolean }>(
    executor,
    sql`
    with recursive up as (
      select id, parent_id from members where id = ${nodeId}
      union all
      select m.id, m.parent_id from members m join up on m.id = up.parent_id
    )
    select exists(select 1 from up where id = ${ancestorId}) as found
  `,
  )
  return Boolean(res[0]?.found)
}

/** First free slot under `rootId`, breadth first and left before right. */
export async function firstOpenSlot(rootId: number, executor: Executor = db) {
  const res = await selectRows<{
    id: number
    depth: number
    has_left: boolean
  }>(
    executor,
    sql`
    with recursive t as (
      select id, depth, ''::text as path from members where id = ${rootId}
      union all
      select m.id, m.depth, t.path || case when m.side = 'left' then '0' else '1' end
      from members m join t on m.parent_id = t.id
    )
    select t.id, t.depth,
      exists(select 1 from members c where c.parent_id = t.id and c.side = 'left') as has_left
    from t
    where (select count(*) from members c where c.parent_id = t.id) < 2
    order by length(t.path), t.path
    limit 1
  `,
  )
  const row = res[0]
  if (!row) throw new Error('No open position found')
  return {
    parentId: row.id,
    depth: row.depth + 1,
    side: (row.has_left ? 'right' : 'left') as 'left' | 'right',
  }
}

/** Checks a chosen slot belongs to the member's tree and is still free. */
export async function claimSlot(
  ownerId: number,
  parentId: number,
  side: 'left' | 'right',
  tx: Tx,
) {
  if (!(await isInSubtree(ownerId, parentId, tx)))
    throw new Error('That position is not in your genealogy')
  const [parent] = await tx
    .select({ depth: members.depth })
    .from(members)
    .where(eq(members.id, parentId))
    .limit(1)
  if (!parent) throw new Error('That position no longer exists')
  const [taken] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.parentId, parentId), eq(members.side, side)))
    .limit(1)
  if (taken)
    throw new Error(
      'That position was just filled — refresh and pick another one',
    )
  return { parentId, side, depth: parent.depth + 1 }
}

export async function assertAvailable(
  usernames: string[],
  email: string | null,
  executor: Executor = db,
) {
  const conds = [inArray(members.username, usernames)]
  if (email) conds.push(eq(members.email, email))
  const clash = await executor
    .select({ username: members.username, email: members.email })
    .from(members)
    .where(or(...conds))
    .limit(1)
  if (clash.length === 0) return
  if (email && clash[0].email === email)
    throw new Error('That email is already registered')
  throw new Error(`Username "${clash[0].username}" is already taken`)
}

/** The company root: the first account, with no parent. */
export async function rootMember(executor: Executor = db) {
  const [root] = await executor
    .select({ id: members.id })
    .from(members)
    .where(isNull(members.parentId))
    .orderBy(members.id)
    .limit(1)
  return root ?? null
}

export type NewMember = {
  fullName: string
  username: string
  email: string | null
  mobile: string
  city: string
  passwordHash: string
  entryReference: string | null
}

/** Inserts one member at a known slot. */
export async function insertMember(
  tx: Tx,
  data: NewMember,
  place: {
    sponsorId: number | null
    parentId: number | null
    side: 'left' | 'right' | null
    depth: number
  },
  extra: Partial<typeof members.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(members)
    .values({
      ...data,
      ...place,
      memberCode: newMemberCode(),
      entryStatus: data.entryReference ? 'pending' : 'unpaid',
      entrySubmittedAt: data.entryReference ? new Date() : null,
      ...extra,
    })
    .returning()
  return row
}

/**
 * Fills a complete binary tree of `count` accounts from one slot. Each account is sponsored by its
 * binary parent inside the batch (the top one by the enrolling member), so confirmed batches
 * activate themselves level by level. With `codes`, account i redeems codes[i] and is confirmed.
 */
export async function insertBulk(
  tx: Tx,
  data: Omit<NewMember, 'username'> & { usernames: string[]; codes?: string[] },
  slot: {
    sponsorId: number
    parentId: number
    side: 'left' | 'right'
    depth: number
  },
) {
  const batchId = `B-${randomBytes(5).toString('hex').toUpperCase()}`
  const pending = Boolean(data.entryReference)
  const base = {
    fullName: data.fullName,
    email: null,
    mobile: data.mobile,
    city: data.city,
    passwordHash: data.passwordHash,
    entryReference: data.entryReference,
    entryStatus: (pending ? 'pending' : 'unpaid') as 'pending' | 'unpaid',
    entrySubmittedAt: pending ? new Date() : null,
    batchId,
  }
  const entry = (i: number) => (data.codes ? redeemedEntry(data.codes[i]) : {})
  let next = 0
  const [top] = await tx
    .insert(members)
    .values({
      ...base,
      ...slot,
      ...entry(next),
      username: data.usernames[next++],
      memberCode: newMemberCode(),
    })
    .returning({ id: members.id, depth: members.depth })
  let level: { id: number; depth: number }[] = [top]
  while (next < data.usernames.length) {
    const rows: (typeof members.$inferInsert)[] = []
    for (const parent of level) {
      for (const side of ['left', 'right'] as const) {
        if (next >= data.usernames.length) break
        rows.push({
          ...base,
          ...entry(next),
          username: data.usernames[next++],
          memberCode: newMemberCode(),
          sponsorId: parent.id,
          parentId: parent.id,
          side,
          depth: parent.depth + 1,
        })
      }
    }
    // Serial ids follow VALUES order, so sorting keeps the parent order for the next level.
    level = (
      await tx
        .insert(members)
        .values(rows)
        .returning({ id: members.id, depth: members.depth })
    ).sort((a, b) => a.id - b.id)
  }
  return { batchId, count: data.usernames.length }
}
