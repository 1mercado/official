import { randomBytes } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/index.js";
import {
  credits,
  members,
  payoutAccounts,
  sessions,
  withdrawals,
} from "../../db/schema.js";
import {
  BULK_SIZES,
  bulkUsernames,
  MOBILE_RE,
  USERNAME_RE,
  type NetworkMember,
  type TreeNode,
} from "@/lib/types";
import {
  assertNotReserved,
  hashPassword,
  isSuperAdmin,
  SUPER_ADMIN_EMAIL,
  requireMember,
  startSession,
  verifyPassword,
} from "./auth.server";
import { claimCodes, markCodesUsed, redeemedEntry } from "./codes.server";
import { runEngine, walletSummary } from "./engine.server";
import {
  assertAvailable,
  claimSlot,
  describePayout,
  insertBulk,
  insertMember,
  isInSubtree,
  lockPlacement,
  payoutFor,
  selectRows,
} from "./members.server";
import { loadPlan } from "./plan.server";

const reference = z.string().trim().max(60);

/** Counts for the dashboard: binary line below the member and paid direct referrals. */
async function lineStats(memberId: number) {
  const res = await selectRows<{
    total: number;
    active: number;
    directs: number;
  }>(
    db,
    sql`
    with recursive t as (
      select id from members where parent_id = ${memberId}
      union all
      select m.id from members m join t on m.parent_id = t.id
    )
    select
      (select count(*) from t)::int as total,
      (select count(*) from t join members m on m.id = t.id where m.is_active and not m.is_suspended)::int as active,
      (select count(*) from members where sponsor_id = ${memberId} and entry_status = 'confirmed')::int as directs
  `,
  );
  return res[0] ?? { total: 0, active: 0, directs: 0 };
}

export const getDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = await requireMember();
    const [stats, latest] = await Promise.all([
      lineStats(me.id),
      db
        .select()
        .from(credits)
        .where(eq(credits.memberId, me.id))
        .orderBy(desc(credits.createdAt), desc(credits.id))
        .limit(8),
    ]);
    return {
      stats,
      credits: latest.map((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        type: c.type,
        description: c.description,
        amount: c.amount,
      })),
    };
  },
);

/**
 * Fingerprint of the signed-in member's own state (entry review, activation, credits,
 * withdrawals, plan). Member screens poll it and reload when an admin changes something.
 */
export const getMemberPulse = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = await requireMember();
    const [p] = await selectRows<{ signature: string }>(
      db,
      sql`
      select concat_ws('|',
        m.entry_status, m.is_active, m.is_suspended, m.full_name, m.mobile, m.city, m.username,
        (select count(*) from credits where member_id = m.id),
        (select coalesce(sum(amount), 0) from credits where member_id = m.id),
        (select max(updated_at) from withdrawals where member_id = m.id),
        (select count(*) from members where sponsor_id = m.id),
        (select max(updated_at) from plan_settings)
      ) as signature
      from members m where m.id = ${me.id}
    `,
    );
    return { signature: p?.signature ?? "", entryStatus: me.entryStatus };
  },
);

export const submitEntryReference = createServerFn({ method: "POST" })
  .validator(
    z.object({
      reference: reference.min(4, "Enter the payment reference number"),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireMember();
    if (me.entryStatus === "confirmed")
      throw new Error("Your entry is already confirmed");
    await db
      .update(members)
      .set({
        entryStatus: "pending",
        entryReference: data.reference,
        entrySubmittedAt: new Date(),
      })
      .where(eq(members.id, me.id));
    return { ok: true };
  });

const TREE_DEPTH = 3;

/** Four levels of the binary tree from `rootId` (defaults to the member). Only the member's own line is visible. */
export const getTree = createServerFn({ method: "GET" })
  .validator(z.object({ rootId: z.number().int().positive().optional() }))
  .handler(async ({ data }) => {
    const me = await requireMember();
    const rootId = data.rootId ?? me.id;
    if (!(await isInSubtree(me.id, rootId)))
      throw new Error("That account is not in your genealogy");
    const res = await selectRows<{
      id: number;
      parent_id: number | null;
      side: "left" | "right" | null;
      username: string;
      full_name: string;
      is_active: boolean;
      entry_status: TreeNode["entryStatus"];
      lvl: number;
    }>(
      db,
      sql`
      with recursive t as (
        select id, parent_id, side, username, full_name, is_active, entry_status, 0 as lvl from members where id = ${rootId}
        union all
        select m.id, m.parent_id, m.side, m.username, m.full_name, m.is_active, m.entry_status, t.lvl + 1
        from members m join t on m.parent_id = t.id
        where t.lvl < ${TREE_DEPTH}
      )
      select * from t
    `,
    );
    const nodes = new Map<number, TreeNode>();
    for (const r of res) {
      nodes.set(r.id, {
        id: r.id,
        username: r.username,
        fullName: r.full_name,
        isActive: r.is_active,
        entryStatus: r.entry_status,
      });
    }
    let parentOfRoot: number | null = null;
    for (const r of res) {
      if (r.id === rootId) {
        parentOfRoot = r.parent_id;
        continue;
      }
      const parent = r.parent_id != null ? nodes.get(r.parent_id) : undefined;
      if (parent && r.side) parent[r.side] = nodes.get(r.id);
    }
    const root = nodes.get(rootId);
    if (!root) throw new Error("Account not found");
    const counts = await selectRows<{ side: string; n: number }>(
      db,
      sql`
      with recursive t as (
        select id, side as branch from members where parent_id = ${rootId}
        union all
        select m.id, t.branch from members m join t on m.parent_id = t.id
      )
      select branch as side, count(*)::int as n from t group by branch
    `,
    );
    const sideCount = (s: string) => counts.find((r) => r.side === s)?.n ?? 0;
    return {
      root,
      depth: TREE_DEPTH,
      isMe: rootId === me.id,
      parentId: rootId === me.id ? null : parentOfRoot,
      leftCount: sideCount("left"),
      rightCount: sideCount("right"),
    };
  });

const slotSchema = z.object({
  parentId: z.number().int().positive(),
  side: z.enum(["left", "right"]),
});

const profileFields = {
  fullName: z.string().trim().min(2, "Please enter the full name").max(80),
  mobile: z
    .string()
    .trim()
    .regex(MOBILE_RE, "Use a valid PH mobile number (09…)"),
  city: z.string().trim().min(2, "Please enter the city").max(60),
  password: z.string().min(6, "Password needs at least 6 characters").max(200),
};

const activationCode = z
  .string()
  .trim()
  .min(1, "Enter the activation code")
  .max(30);

export const registerMember = createServerFn({ method: "POST" })
  .validator(
    slotSchema.extend({
      ...profileFields,
      activationCode,
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(USERNAME_RE, "Username: 3–20 letters, numbers or _"),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireMember();
    assertNotReserved(data.username);
    await assertAvailable([data.username], null);
    const passwordHash = await hashPassword(data.password);
    const row = await db.transaction(async (tx) => {
      await lockPlacement(tx);
      const [code] = await claimCodes(tx, [data.activationCode]);
      const slot = await claimSlot(me.id, data.parentId, data.side, tx);
      const row = await insertMember(
        tx,
        {
          fullName: data.fullName,
          username: data.username,
          email: null,
          mobile: data.mobile,
          city: data.city,
          passwordHash,
          entryReference: code,
        },
        { sponsorId: me.id, ...slot },
        redeemedEntry(code),
      );
      await markCodesUsed(tx, [code], sql`m.id = ${row.id}`);
      return row;
    });
    const engine = await runEngine();
    return { username: row.username, memberCode: row.memberCode, ...engine };
  });

export const bulkEnroll = createServerFn({ method: "POST" })
  .validator(
    slotSchema.extend({
      ...profileFields,
      activationCodes: z.array(activationCode).min(1).max(1023),
      count: z
        .number()
        .refine((n) => BULK_SIZES.includes(n), "Pick one of the bulk sizes"),
      baseUsername: z
        .string()
        .trim()
        .toLowerCase()
        .regex(
          /^[a-z0-9_]{3,16}$/,
          "Base username: 3–16 letters, numbers or _",
        ),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireMember();
    const usernames = bulkUsernames(data.baseUsername, data.count);
    for (const u of usernames) assertNotReserved(u);
    await assertAvailable(usernames, null);
    if (data.activationCodes.length !== data.count)
      throw new Error(
        `Enter exactly ${data.count.toLocaleString("en-PH")} activation codes — one per account (you entered ${data.activationCodes.length.toLocaleString("en-PH")})`,
      );
    const passwordHash = await hashPassword(data.password);
    const res = await db.transaction(async (tx) => {
      await lockPlacement(tx);
      const codes = await claimCodes(tx, data.activationCodes);
      const slot = await claimSlot(me.id, data.parentId, data.side, tx);
      const res = await insertBulk(
        tx,
        {
          fullName: data.fullName,
          email: null,
          mobile: data.mobile,
          city: data.city,
          passwordHash,
          entryReference: null,
          usernames,
          codes,
        },
        { sponsorId: me.id, ...slot },
      );
      await markCodesUsed(tx, codes, sql`m.batch_id = ${res.batchId}`);
      return res;
    });
    const engine = await runEngine();
    return { ...res, ...engine };
  });

/** Lets a member whose entry isn't confirmed yet pay it with an activation code. */
export const redeemActivationCode = createServerFn({ method: "POST" })
  .validator(z.object({ code: activationCode }))
  .handler(async ({ data }) => {
    const me = await requireMember();
    if (me.entryStatus === "confirmed")
      throw new Error("Your entry is already confirmed");
    await db.transaction(async (tx) => {
      const [code] = await claimCodes(tx, [data.code]);
      await tx
        .update(members)
        .set(redeemedEntry(code))
        .where(eq(members.id, me.id));
      await markCodesUsed(tx, [code], sql`m.id = ${me.id}`);
    });
    return runEngine();
  });

const NETWORK_LIMIT = 2000;

/** Everyone below the member in the binary tree, nearest levels first. */
export const getNetwork = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = await requireMember();
    const res = await selectRows<{
      id: number;
      full_name: string;
      username: string;
      member_code: string;
      lvl: number;
      branch: "left" | "right" | null;
      city: string;
      is_active: boolean;
      entry_status: NetworkMember["entryStatus"];
      directs: number;
      created_at: string | Date;
    }>(
      db,
      sql`
    with recursive t as (
      select id, 1 as lvl, side as branch from members where parent_id = ${me.id}
      union all
      select m.id, t.lvl + 1, t.branch from members m join t on m.parent_id = t.id
    )
    select m.id, m.full_name, m.username, m.member_code, t.lvl, t.branch, m.city, m.is_active,
      m.entry_status, m.created_at,
      (select count(*) from members d where d.sponsor_id = m.id)::int as directs
    from t join members m on m.id = t.id
    order by t.lvl, m.id
    limit ${NETWORK_LIMIT + 1}
  `,
    );
    const rows: NetworkMember[] = res.slice(0, NETWORK_LIMIT).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      username: r.username,
      memberCode: r.member_code,
      level: r.lvl,
      side: r.branch,
      city: r.city,
      isActive: r.is_active,
      entryStatus: r.entry_status,
      directs: r.directs,
      joinedAt: new Date(r.created_at).toISOString(),
    }));
    return { rows, truncated: res.length > NETWORK_LIMIT };
  },
);

export const getEarnings = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = await requireMember();
    const rows = await db
      .select()
      .from(credits)
      .where(eq(credits.memberId, me.id))
      .orderBy(desc(credits.createdAt), desc(credits.id))
      .limit(1000);
    return rows.map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      type: c.type,
      description: c.description,
      amount: c.amount,
    }));
  },
);

function toWithdrawal(w: typeof withdrawals.$inferSelect) {
  return {
    id: w.id,
    createdAt: w.createdAt.toISOString(),
    reference: w.reference,
    account: describePayout(w as Parameters<typeof describePayout>[0]),
    amount: w.amount,
    status: w.status,
    note: w.note,
  };
}

export const getWallet = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireMember();
  const [payout, rows] = await Promise.all([
    payoutFor(me.id),
    db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.memberId, me.id))
      .orderBy(desc(withdrawals.createdAt))
      .limit(200),
  ]);
  return { payout, withdrawals: rows.map(toWithdrawal) };
});

export const requestWithdrawal = createServerFn({ method: "POST" })
  .validator(z.object({ amount: z.number().int("Use whole pesos").positive() }))
  .handler(async ({ data }) => {
    const me = await requireMember();
    return db.transaction(async (tx) => {
      // One request at a time per member so balance and daily-limit checks can't be raced.
      await tx.execute(sql`select pg_advisory_xact_lock(2, ${me.id})`);
      const plan = await loadPlan(tx);
      const payout = await payoutFor(me.id, tx);
      if (!payout)
        throw new Error("Add your payout account in Profile & Payouts first");
      const wallet = await walletSummary(me.id, plan, tx);
      if (data.amount < plan.minWithdrawal)
        throw new Error(
          `Minimum withdrawal is ₱${plan.minWithdrawal.toLocaleString("en-PH")}`,
        );
      if (data.amount > wallet.balance)
        throw new Error("Amount is more than your available balance");
      if (data.amount > wallet.remainingToday)
        throw new Error("That exceeds today’s withdrawal limit");
      const [row] = await tx
        .insert(withdrawals)
        .values({
          memberId: me.id,
          reference: `WD-${randomBytes(4).toString("hex").toUpperCase()}`,
          amount: data.amount,
          method: payout.method,
          accountName: payout.accountName,
          accountNumber: payout.accountNumber,
          bankName: payout.bankName,
        })
        .returning();
      return toWithdrawal(row);
    });
  });

export const getProfile = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = await requireMember();
    return { payout: await payoutFor(me.id) };
  },
);

export const updateProfile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fullName: profileFields.fullName,
      mobile: profileFields.mobile,
      city: profileFields.city,
      email: z.union([
        z.email("Please enter a valid email").trim().toLowerCase().max(120),
        z.literal(""),
      ]),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireMember();
    const email = data.email || null;
    if (isSuperAdmin(me) && email !== SUPER_ADMIN_EMAIL)
      throw new Error("The admin account email is fixed");
    if (email) {
      const [clash] = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.email, email), ne(members.id, me.id)))
        .limit(1);
      if (clash) throw new Error("That email is already registered");
    }
    await db
      .update(members)
      .set({
        fullName: data.fullName,
        mobile: data.mobile,
        city: data.city,
        email,
      })
      .where(eq(members.id, me.id));
    return { ok: true };
  });

export const changePassword = createServerFn({ method: "POST" })
  .validator(
    z.object({
      current: z.string().min(1, "Enter your current password").max(200),
      next: profileFields.password,
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireMember();
    if (!(await verifyPassword(data.current, me.passwordHash)))
      throw new Error("Current password is incorrect");
    const passwordHash = await hashPassword(data.next);
    // Signs out every other device, then keeps this one signed in with a fresh session.
    await db.transaction(async (tx) => {
      await tx
        .update(members)
        .set({ passwordHash })
        .where(eq(members.id, me.id));
      await tx.delete(sessions).where(eq(sessions.memberId, me.id));
    });
    await startSession(me.id);
    return { ok: true };
  });

export const savePayout = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        method: z.enum(["GCash", "Maya", "DigiCash", "Bank"]),
        accountName: z.string().trim().min(2, "Enter the account name").max(80),
        accountNumber: z
          .string()
          .trim()
          .min(6, "Enter the account or mobile number")
          .max(40),
        bankName: z.string().trim().max(60).optional(),
      })
      .refine(
        (d) => d.method !== "Bank" || (d.bankName && d.bankName.length >= 2),
        {
          message: "Enter the bank name",
          path: ["bankName"],
        },
      ),
  )
  .handler(async ({ data }) => {
    const me = await requireMember();
    const values = {
      method: data.method,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      bankName: data.method === "Bank" ? data.bankName! : null,
      updatedAt: new Date(),
    };
    await db
      .insert(payoutAccounts)
      .values({ memberId: me.id, ...values })
      .onConflictDoUpdate({ target: payoutAccounts.memberId, set: values });
    return { ok: true };
  });
