import { randomBytes } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/index.js";
import {
  activationCodes,
  credits,
  groceryOrders,
  members,
  payoutAccounts,
  planSettings,
  sessions,
  withdrawals,
} from "../../db/schema.js";
import { MOBILE_RE, USERNAME_RE } from "@/lib/types";
import {
  assertNotReserved,
  createResetLink,
  hashPassword,
  requireAdmin,
  startSession,
} from "./auth.server";
import { newActivationCode } from "./codes.server";
import { runEngine, walletSummary } from "./engine.server";
import {
  assertAvailable,
  describePayout,
  firstOpenSlot,
  insertMember,
  lockPlacement,
  payoutFor,
  rootMember,
  selectRows,
  toMember,
} from "./members.server";
import { loadPlan } from "./plan.server";

const id = z.number().int().positive();

const CODE_LIST_LIMIT = 2000;

/** Everything the console's queues and overview need in one round trip. */
export const getAdminData = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    const [
      overviewRes,
      batches,
      queue,
      ledger,
      resets,
      plan,
      registrations,
      registrationCounts,
      codes,
      codeCounts,
    ] = await Promise.all([
      selectRows<{
        members: number;
        active: number;
        pending_entries: number;
        pending_withdrawals: number;
        credited: number;
        paid_out: number;
        awaiting_payout: number;
      }>(
        db,
        sql`
      select
        (select count(*) from members)::int as members,
        (select count(*) from members where is_active)::int as active,
        (select count(*) from members where entry_status = 'pending')::int as pending_entries,
        (select count(*) from withdrawals where status in ('pending', 'approved'))::int as pending_withdrawals,
        coalesce((select sum(amount) from credits), 0)::int as credited,
        coalesce((select sum(amount) from withdrawals where status = 'paid'), 0)::int as paid_out,
        coalesce((select sum(amount) from withdrawals where status in ('pending', 'approved')), 0)::int as awaiting_payout
    `,
      ),
      selectRows<{
        batch_id: string;
        n: number;
        first: string;
        full_name: string;
        reference: string | null;
        submitted: string;
      }>(
        db,
        sql`
      select batch_id, count(*)::int as n, (array_agg(username order by id))[1] as first,
        min(full_name) as full_name, min(entry_reference) as reference, min(entry_submitted_at) as submitted
      from members
      where entry_status = 'pending' and batch_id is not null
      group by batch_id
      order by min(entry_submitted_at)
      limit 100
    `,
      ),
      db
        .select({
          w: withdrawals,
          username: members.username,
          fullName: members.fullName,
        })
        .from(withdrawals)
        .innerJoin(members, eq(withdrawals.memberId, members.id))
        .where(inArray(withdrawals.status, ["pending", "approved"]))
        .orderBy(withdrawals.createdAt)
        .limit(300),
      db
        .select({
          id: credits.id,
          createdAt: credits.createdAt,
          type: credits.type,
          description: credits.description,
          amount: credits.amount,
          username: members.username,
        })
        .from(credits)
        .innerJoin(members, eq(credits.memberId, members.id))
        .orderBy(desc(credits.createdAt), desc(credits.id))
        .limit(200),
      db
        .select({
          id: members.id,
          username: members.username,
          fullName: members.fullName,
          mobile: members.mobile,
          requestedAt: members.resetRequestedAt,
        })
        .from(members)
        .where(isNotNull(members.resetRequestedAt))
        .orderBy(members.resetRequestedAt)
        .limit(100),
      loadPlan(),
      db
        .select({
          id: members.id,
          fullName: members.fullName,
          username: members.username,
          memberCode: members.memberCode,
          mobile: members.mobile,
          city: members.city,
          status: members.entryStatus,
          reference: members.entryReference,
          submittedAt: members.entrySubmittedAt,
          createdAt: members.createdAt,
          sponsor: sql<
            string | null
          >`(select s.username from members s where s.id = ${members.sponsorId})`,
        })
        .from(members)
        .where(and(isNull(members.batchId), eq(members.isAdmin, false)))
        .orderBy(
          sql`coalesce(${members.entrySubmittedAt}, ${members.createdAt}) desc`,
          desc(members.id),
        )
        .limit(300),
      selectRows<{ status: string; n: number }>(
        db,
        sql`select entry_status as status, count(*)::int as n from members
            where batch_id is null and not is_admin group by entry_status`,
      ),
      db
        .select({
          id: activationCodes.id,
          code: activationCodes.code,
          status: activationCodes.status,
          note: activationCodes.note,
          batchId: activationCodes.batchId,
          createdAt: activationCodes.createdAt,
          usedAt: activationCodes.usedAt,
          usedBy: members.username,
          usedByName: members.fullName,
          usedById: members.id,
          sponsor: sql<
            string | null
          >`(select s.username from members s where s.id = ${members.sponsorId})`,
        })
        .from(activationCodes)
        .leftJoin(members, eq(activationCodes.usedBy, members.id))
        .orderBy(
          sql`coalesce(${activationCodes.usedAt}, ${activationCodes.createdAt}) desc`,
          desc(activationCodes.id),
        )
        .limit(CODE_LIST_LIMIT),
      selectRows<{ status: string; n: number }>(
        db,
        sql`select status, count(*)::int as n from activation_codes group by status`,
      ),
    ]);
    const o = overviewRes[0];
    return {
      overview: {
        members: o.members,
        active: o.active,
        pendingEntries: o.pending_entries,
        pendingWithdrawals: o.pending_withdrawals,
        credited: o.credited,
        paidOut: o.paid_out,
        awaitingPayout: o.awaiting_payout,
      },
      batches: batches.map((b) => ({
        batchId: b.batch_id,
        count: b.n,
        firstUsername: b.first,
        fullName: b.full_name,
        reference: b.reference,
        submittedAt: b.submitted ? new Date(b.submitted).toISOString() : null,
      })),
      withdrawals: queue.map(({ w, username, fullName }) => ({
        id: w.id,
        reference: w.reference,
        username,
        fullName,
        amount: w.amount,
        status: w.status,
        account: describePayout(w as Parameters<typeof describePayout>[0]),
        accountName: w.accountName,
        createdAt: w.createdAt.toISOString(),
      })),
      ledger: ledger.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      resets: resets.map((r) => ({
        ...r,
        requestedAt: r.requestedAt!.toISOString(),
      })),
      plan,
      registrations: registrations.map((r) => ({
        ...r,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      registrationCounts: Object.fromEntries(
        registrationCounts.map((c) => [c.status, c.n]),
      ) as Partial<
        Record<"unpaid" | "pending" | "confirmed" | "rejected", number>
      >,
      codes: codes.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        usedAt: c.usedAt?.toISOString() ?? null,
      })),
      codeCounts: Object.fromEntries(
        codeCounts.map((c) => [c.status, c.n]),
      ) as Partial<Record<"unused" | "used" | "void", number>>,
    };
  },
);

/**
 * Cheap fingerprint of everything the console shows. The console polls it and reloads
 * its data only when something changed — new sign-ups, submitted references, withdrawals,
 * credits, password-help requests or plan edits.
 */
export const getAdminPulse = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    const [p] = await selectRows<{
      signature: string;
      pending_entries: number;
      pending_withdrawals: number;
      used_codes: number;
    }>(
      db,
      sql`
      select
        concat_ws('|',
          (select count(*) from members),
          (select max(id) from members),
          (select count(*) from members where entry_status = 'pending'),
          (select count(*) from members where is_active),
          (select max(greatest(created_at, coalesce(entry_submitted_at, created_at), coalesce(entry_confirmed_at, created_at))) from members),
          (select string_agg(entry_status, '') from (select entry_status from members order by id desc limit 300) r),
          (select count(*) from withdrawals),
          (select max(updated_at) from withdrawals),
          (select count(*) from credits),
          (select max(id) from credits),
          (select count(*) from members where reset_requested_at is not null),
          (select max(updated_at) from plan_settings),
          (select count(*) from activation_codes),
          (select max(updated_at) from activation_codes)
        ) as signature,
        (select count(*) from members where entry_status = 'pending')::int as pending_entries,
        (select count(*) from withdrawals where status = 'pending')::int as pending_withdrawals,
        (select count(*) from activation_codes where status = 'used')::int as used_codes
    `,
    );
    return {
      signature: p.signature,
      pendingEntries: p.pending_entries,
      pendingWithdrawals: p.pending_withdrawals,
      usedCodes: p.used_codes,
    };
  },
);

export type AdminData = Awaited<ReturnType<typeof getAdminData>>;

export const reviewEntry = createServerFn({ method: "POST" })
  .validator(
    z.object({
      memberIds: z.array(id).max(2000).optional(),
      batchId: z.string().max(40).optional(),
      action: z.enum(["confirm", "reject"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const target = data.batchId
      ? and(
          eq(members.batchId, data.batchId),
          inArray(members.entryStatus, ["pending", "unpaid"]),
        )
      : data.memberIds?.length
        ? and(
            inArray(members.id, data.memberIds),
            sql`${members.entryStatus} <> 'confirmed'`,
          )
        : undefined;
    if (!target) throw new Error("Nothing selected");
    const rows = await db
      .update(members)
      .set(
        data.action === "confirm"
          ? { entryStatus: "confirmed", entryConfirmedAt: new Date() }
          : { entryStatus: "rejected" },
      )
      .where(target)
      .returning({ id: members.id });
    const engine =
      data.action === "confirm"
        ? await runEngine()
        : { activated: 0, credited: 0 };
    return { updated: rows.length, ...engine };
  });

export const reviewWithdrawal = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id,
      action: z.enum(["approve", "paid", "reject"]),
      note: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const from =
      data.action === "approve" ? ["pending"] : ["pending", "approved"];
    const status =
      data.action === "approve"
        ? "approved"
        : data.action === "paid"
          ? "paid"
          : "rejected";
    const [row] = await db
      .update(withdrawals)
      .set({ status, note: data.note || null, updatedAt: new Date() })
      .where(
        and(
          eq(withdrawals.id, data.id),
          inArray(withdrawals.status, from as ("pending" | "approved")[]),
        ),
      )
      .returning({ id: withdrawals.id });
    if (!row)
      throw new Error("This request was already handled — refresh the list");
    return { ok: true };
  });

export const searchMembers = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().trim().max(80) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const term = `%${data.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await db
      .select({
        m: members,
        sponsor: sql<
          string | null
        >`(select username from members s where s.id = ${members.sponsorId})`,
        balance: sql<number>`(
          coalesce((select sum(amount) from credits c where c.member_id = ${members.id}), 0)
          - coalesce((select sum(amount) from withdrawals w where w.member_id = ${members.id} and w.status <> 'rejected'), 0)
        )::int`,
        earned: sql<number>`coalesce((select sum(amount) from credits c where c.member_id = ${members.id}), 0)::int`,
      })
      .from(members)
      .where(
        data.q
          ? or(
              ilike(members.username, term),
              ilike(members.fullName, term),
              ilike(members.memberCode, term),
              ilike(members.mobile, term),
              ilike(members.email, term),
            )
          : undefined,
      )
      .orderBy(desc(members.createdAt))
      .limit(50);
    return rows.map(({ m, sponsor, balance, earned }) => ({
      ...toMember(m),
      isSuspended: m.isSuspended,
      batchId: m.batchId,
      sponsor,
      balance,
      earned,
    }));
  });

export type AdminMember = Awaited<ReturnType<typeof searchMembers>>[number];

export const updateMemberFlags = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id,
      isSuspended: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    if (data.id === admin.id && data.isSuspended)
      throw new Error("You cannot suspend the super admin account");
    await db
      .update(members)
      .set({ isSuspended: data.isSuspended })
      .where(eq(members.id, data.id));
    if (data.isSuspended === true)
      await db.execute(sql`delete from sessions where member_id = ${data.id}`);
    // Unsuspending may make the account (and its line) eligible again.
    if (data.isSuspended === false) await runEngine([data.id]);
    return { ok: true };
  });

export const adjustBalance = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id,
      amount: z
        .number()
        .int("Use whole pesos")
        .refine((n) => n !== 0, "Amount cannot be zero")
        .refine((n) => Math.abs(n) <= 1_000_000, "Amount is too large"),
      reason: z.string().trim().min(3, "Add a short reason").max(120),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.insert(credits).values({
      memberId: data.id,
      type: "adjustment",
      sourceKey: `adj:${randomBytes(8).toString("hex")}`,
      description: data.reason,
      amount: data.amount,
    });
    return { ok: true };
  });

export const createPasswordResetLink = createServerFn({ method: "POST" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return { url: await createResetLink(data.id) };
  });

export const dismissPasswordHelp = createServerFn({ method: "POST" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db
      .update(members)
      .set({ resetRequestedAt: null })
      .where(eq(members.id, data.id));
    return { ok: true };
  });

const whole = (min: number) => z.number().int("Use whole numbers").min(min);

export const savePlanSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      entryPrice: whole(0),
      requiredDirects: whole(0).max(20),
      perActiveAccount: whole(0),
      matchingBonus: whole(0),
      matchingLevels: whole(0).max(30),
      earningCap: whole(0),
      dailyWithdrawalLimit: whole(1),
      minWithdrawal: whole(1),
      paymentInstructions: z
        .string()
        .trim()
        .min(10, "Add payment instructions")
        .max(1000),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const values = { ...data, updatedAt: new Date() };
    await db
      .insert(planSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: planSettings.id, set: values });
    // A lower activation threshold may activate accounts right away.
    const engine = await runEngine();
    return { ok: true, ...engine };
  });

const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, "Username: 3–20 letters, numbers or _");
const optionalEmail = z.union([
  z.email("Please enter a valid email").trim().toLowerCase().max(120),
  z.literal(""),
]);
const memberFields = {
  fullName: z.string().trim().min(2, "Please enter the full name").max(80),
  username: usernameField,
  email: optionalEmail,
  mobile: z
    .string()
    .trim()
    .regex(MOBILE_RE, "Use a valid PH mobile number (09…)"),
  city: z.string().trim().min(2, "Please enter the city").max(60),
};
const password = z
  .string()
  .min(6, "Password needs at least 6 characters")
  .max(200);

/** Rejects a username or email that another account already holds. */
async function assertFree(
  username: string,
  email: string | null,
  self: number,
) {
  const conds = [eq(members.username, username)];
  if (email) conds.push(eq(members.email, email));
  const [clash] = await db
    .select({ username: members.username, email: members.email })
    .from(members)
    .where(and(or(...conds), sql`${members.id} <> ${self}`))
    .limit(1);
  if (!clash) return;
  if (email && clash.email === email)
    throw new Error("That email is already registered");
  throw new Error(`Username "${username}" is already taken`);
}

/** Edits any member's profile, login names and entry details. */
export const updateMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id,
      ...memberFields,
      entryReference: z.string().trim().max(60),
      entryStatus: z.enum(["unpaid", "pending", "confirmed", "rejected"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const email = data.email || null;
    assertNotReserved(data.username);
    await assertFree(data.username, email, data.id);
    const [current] = await db
      .select({ entryStatus: members.entryStatus })
      .from(members)
      .where(eq(members.id, data.id))
      .limit(1);
    if (!current) throw new Error("That member no longer exists");
    if (current.entryStatus === "confirmed" && data.entryStatus !== "confirmed")
      throw new Error(
        "A confirmed entry cannot be reverted — suspend the account instead",
      );
    const confirming =
      current.entryStatus !== "confirmed" && data.entryStatus === "confirmed";
    await db
      .update(members)
      .set({
        fullName: data.fullName,
        username: data.username,
        email,
        mobile: data.mobile,
        city: data.city,
        entryReference: data.entryReference || null,
        entryStatus: data.entryStatus,
        ...(confirming ? { entryConfirmedAt: new Date() } : {}),
        ...(data.entryStatus === "pending" && current.entryStatus !== "pending"
          ? { entrySubmittedAt: new Date() }
          : {}),
      })
      .where(eq(members.id, data.id));
    const engine = confirming
      ? await runEngine()
      : { activated: 0, credited: 0 };
    return { ok: true, ...engine };
  });

/** Sets a new password for any member and signs them out everywhere. */
export const setMemberPassword = createServerFn({ method: "POST" })
  .validator(z.object({ id, password }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const passwordHash = await hashPassword(data.password);
    await db.transaction(async (tx) => {
      await tx
        .update(members)
        .set({ passwordHash, resetRequestedAt: null })
        .where(eq(members.id, data.id));
      await tx.delete(sessions).where(eq(sessions.memberId, data.id));
    });
    if (data.id === admin.id) await startSession(admin.id);
    return { ok: true };
  });

/** Adds an account under a sponsor (the company root when blank), optionally with the entry already confirmed. */
export const createMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ...memberFields,
      password,
      sponsor: z.string().trim().max(40),
      confirmEntry: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const email = data.email || null;
    assertNotReserved(data.username);
    await assertAvailable([data.username], email);
    const passwordHash = await hashPassword(data.password);
    const row = await db.transaction(async (tx) => {
      await lockPlacement(tx);
      const root = await rootMember(tx);
      if (!root) throw new Error("Create the company root account first");
      let sponsorId = root.id;
      if (data.sponsor) {
        const [sponsor] = await tx
          .select({ id: members.id })
          .from(members)
          .where(
            or(
              eq(members.memberCode, data.sponsor.toUpperCase()),
              eq(members.username, data.sponsor.toLowerCase()),
            ),
          )
          .limit(1);
        if (!sponsor) throw new Error("That sponsor was not found");
        sponsorId = sponsor.id;
      }
      const slot = await firstOpenSlot(sponsorId, tx);
      return insertMember(
        tx,
        {
          fullName: data.fullName,
          username: data.username,
          email,
          mobile: data.mobile,
          city: data.city,
          passwordHash,
          entryReference: null,
        },
        { sponsorId, ...slot },
        data.confirmEntry
          ? { entryStatus: "confirmed", entryConfirmedAt: new Date() }
          : {},
      );
    });
    const engine = data.confirmEntry
      ? await runEngine()
      : { activated: 0, credited: 0 };
    return { username: row.username, memberCode: row.memberCode, ...engine };
  });

/** Wallet, payout account, credits and withdrawals for one member. */
export const getMemberDetail = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const plan = await loadPlan();
    const [wallet, payout, creditRows, withdrawalRows, counts] =
      await Promise.all([
        walletSummary(data.id, plan),
        payoutFor(data.id),
        db
          .select()
          .from(credits)
          .where(eq(credits.memberId, data.id))
          .orderBy(desc(credits.createdAt), desc(credits.id))
          .limit(100),
        db
          .select()
          .from(withdrawals)
          .where(eq(withdrawals.memberId, data.id))
          .orderBy(desc(withdrawals.createdAt))
          .limit(100),
        selectRows<{ directs: number; paid_directs: number }>(
          db,
          sql`select count(*)::int as directs,
            count(*) filter (where entry_status = 'confirmed')::int as paid_directs
            from members where sponsor_id = ${data.id}`,
        ),
      ]);
    return {
      wallet,
      payout,
      directs: counts[0]?.directs ?? 0,
      paidDirects: counts[0]?.paid_directs ?? 0,
      credits: creditRows.map((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        type: c.type,
        description: c.description,
        amount: c.amount,
      })),
      withdrawals: withdrawalRows.map((w) => ({
        id: w.id,
        createdAt: w.createdAt.toISOString(),
        reference: w.reference,
        account: describePayout(w as Parameters<typeof describePayout>[0]),
        amount: w.amount,
        status: w.status,
        note: w.note,
      })),
    };
  });

export type MemberDetail = Awaited<ReturnType<typeof getMemberDetail>>;

/** Sets or replaces any member's payout account. */
export const saveMemberPayout = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        id,
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
        { message: "Enter the bank name", path: ["bankName"] },
      ),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const values = {
      method: data.method,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      bankName: data.method === "Bank" ? data.bankName! : null,
      updatedAt: new Date(),
    };
    await db
      .insert(payoutAccounts)
      .values({ memberId: data.id, ...values })
      .onConflictDoUpdate({ target: payoutAccounts.memberId, set: values });
    return { ok: true };
  });

/** Every withdrawal, newest first, optionally filtered by status. */
export const listWithdrawals = createServerFn({ method: "GET" })
  .validator(
    z.object({
      status: z.enum(["all", "pending", "approved", "paid", "rejected"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const rows = await db
      .select({
        w: withdrawals,
        username: members.username,
        fullName: members.fullName,
      })
      .from(withdrawals)
      .innerJoin(members, eq(withdrawals.memberId, members.id))
      .where(
        data.status === "all" ? undefined : eq(withdrawals.status, data.status),
      )
      .orderBy(desc(withdrawals.createdAt))
      .limit(300);
    return rows.map(({ w, username, fullName }) => ({
      id: w.id,
      reference: w.reference,
      username,
      fullName,
      amount: w.amount,
      status: w.status,
      account: describePayout(w as Parameters<typeof describePayout>[0]),
      accountName: w.accountName,
      note: w.note,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }));
  });

/** Creates a batch of single-use activation codes. Each one pays one account's entry. */
export const generateActivationCodes = createServerFn({ method: "POST" })
  .validator(
    z.object({
      count: z
        .number()
        .int()
        .min(1, "Generate at least 1 code")
        .max(1023, "Generate up to 1,023 codes at a time"),
      note: z.string().trim().max(80),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const batchId = `C-${randomBytes(4).toString("hex").toUpperCase()}`;
    const codes = new Set<string>();
    while (codes.size < data.count) codes.add(newActivationCode());
    const rows = await db
      .insert(activationCodes)
      .values(
        [...codes].map((code) => ({
          code,
          batchId,
          note: data.note || null,
          createdBy: admin.id,
        })),
      )
      .onConflictDoNothing({ target: activationCodes.code })
      .returning({ code: activationCodes.code });
    return { batchId, codes: rows.map((r) => r.code) };
  });

/** Cancels unused codes so they can no longer be redeemed. Used codes are left untouched. */
export const voidActivationCodes = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(id).min(1).max(CODE_LIST_LIMIT) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const rows = await db
      .update(activationCodes)
      .set({ status: "void", updatedAt: new Date() })
      .where(
        and(
          inArray(activationCodes.id, data.ids),
          eq(activationCodes.status, "unused"),
        ),
      )
      .returning({ id: activationCodes.id });
    return { voided: rows.length };
  });

/** Explicit administrator deletion, including records beyond the displayed list. */
export const deleteActivationCodes = createServerFn({ method: "POST" })
  .validator(
    z.object({ all: z.boolean(), ids: z.array(id).max(CODE_LIST_LIMIT) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.all && !data.ids.length)
      throw new Error("Select at least one code");
    const deleted = await db
      .delete(activationCodes)
      .where(data.all ? undefined : inArray(activationCodes.id, data.ids))
      .returning({ id: activationCodes.id });
    return { deleted: deleted.length };
  });

/** Permanently removes a leaf account after explicit administrator confirmation. */
export const deleteMember = createServerFn({ method: "POST" })
  .validator(z.object({ id, username: z.string().trim().min(1) }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(1998001)`);
      await lockPlacement(tx);
      const [member] = await tx
        .select()
        .from(members)
        .where(eq(members.id, data.id))
        .for("update");
      if (!member) throw new Error("Member no longer exists");
      if (member.id === admin.id || member.isAdmin || member.parentId === null)
        throw new Error("The administrator and company root cannot be deleted");
      if (member.username !== data.username)
        throw new Error("Enter the exact username to confirm deletion");
      const [dependent] = await tx
        .select({ id: members.id })
        .from(members)
        .where(
          or(eq(members.parentId, member.id), eq(members.sponsorId, member.id)),
        )
        .limit(1);
      if (dependent)
        throw new Error(
          "This member has downline members or referrals. Suspend the account instead.",
        );
      const [payout] = await tx
        .select({ id: withdrawals.id })
        .from(withdrawals)
        .where(
          and(
            eq(withdrawals.memberId, member.id),
            inArray(withdrawals.status, ["pending", "approved"]),
          ),
        )
        .limit(1);
      if (payout)
        throw new Error(
          "Resolve pending withdrawals before deleting this account",
        );
      const orders = await tx
        .select()
        .from(groceryOrders)
        .where(eq(groceryOrders.memberId, member.id))
        .for("update");
      if (
        orders.some(
          (order) => order.status === "pending" || order.status === "confirmed",
        )
      )
        throw new Error("Close grocery orders before deleting this account");
      await tx
        .delete(groceryOrders)
        .where(eq(groceryOrders.memberId, member.id));
      // Preserve other members' earned credits without a dangling member reference.
      await tx
        .update(credits)
        .set({ sourceMemberId: null })
        .where(eq(credits.sourceMemberId, member.id));
      await tx.delete(members).where(eq(members.id, member.id));
      return { deleted: true };
    });
  });
