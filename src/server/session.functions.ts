import { signupSchema } from "@/lib/signup";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/index.js";
import { members, passwordResets, sessions } from "../../db/schema.js";
import {
  assertNotReserved,
  currentMember,
  createEmailResetLink,
  endSession,
  hashPassword,
  hashToken,
  startSession,
  verifyPassword,
} from "./auth.server";
import { claimCodes, markCodesUsed, redeemedEntry } from "./codes.server";
import { runEngine, walletSummary } from "./engine.server";
import {
  assertAvailable,
  firstOpenSlot,
  insertMember,
  lockPlacement,
  requestOrigin,
  rootMember,
  toMember,
} from "./members.server";
import { sendPasswordResetEmail, assertEmailConfigured } from "./email.server";
import { loadPlan } from "./plan.server";

/** Signed-in member, live plan and wallet numbers for the app shell. Null when signed out. */
export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = await currentMember();
    if (!me) return null;
    const plan = await loadPlan();
    const wallet = await walletSummary(me.id, plan);
    return { member: toMember(me), plan, wallet, origin: requestOrigin() };
  },
);

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Plan numbers for the public pages, plus whether someone is already signed in. */
export const getPublicInfo = createServerFn({ method: "GET" }).handler(
  async () => {
    const [plan, me] = await Promise.all([loadPlan(), currentMember()]);
    return { plan, signedIn: Boolean(me) };
  },
);

const signInSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email").max(120),
  password: z.string().min(1, "Enter your password").max(200),
});

export const signIn = createServerFn({ method: "POST" })
  .validator(signInSchema)
  .handler(async ({ data }) => {
    const id = data.identifier.toLowerCase();
    const [m] = await db
      .select()
      .from(members)
      .where(or(eq(members.username, id), eq(members.email, id)))
      .limit(1);
    if (!m || !(await verifyPassword(data.password, m.passwordHash)))
      throw new Error("Wrong username/email or password");
    if (m.isSuspended)
      throw new Error(
        "This account is suspended. Please contact 1MERCADO support.",
      );
    await startSession(m.id);
    return { ok: true };
  });

export const signUp = createServerFn({ method: "POST" })
  .validator(signupSchema)
  .handler(async ({ data }) => {
    assertNotReserved(data.username);
    await assertAvailable([data.username], data.email);
    const passwordHash = await hashPassword(data.password);
    const member = await db.transaction(async (tx) => {
      await lockPlacement(tx);
      const root = await rootMember(tx);
      const profile = {
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        mobile: data.mobile,
        city: data.city,
        passwordHash,
        entryReference: null,
        membershipConsentAt: new Date(),
        membershipConsentVersion: "2026-10-24",
      };
      if (!root)
        throw new Error(
          "Registration is unavailable. Please contact the administrator.",
        );
      const [code] = await claimCodes(tx, [data.activationCode]);
      let sponsorId = root.id;
      if (data.referrerCode) {
        const [sponsor] = await tx
          .select({ id: members.id, suspended: members.isSuspended })
          .from(members)
          .where(
            or(
              eq(members.memberCode, data.referrerCode),
              eq(members.username, data.referrerCode.toLowerCase()),
            ),
          )
          .limit(1);
        if (!sponsor || sponsor.suspended)
          throw new Error("That referrer code was not found");
        sponsorId = sponsor.id;
      }
      const slot = await firstOpenSlot(sponsorId, tx);
      const row = await insertMember(
        tx,
        { ...profile, entryReference: code },
        { sponsorId, ...slot },
        { isAdmin: false, ...(code ? redeemedEntry(code) : {}) },
      );
      if (code) await markCodesUsed(tx, [code], sql`m.id = ${row.id}`);
      return row;
    });
    if (member.entryStatus === "confirmed" && member.parentId != null)
      await runEngine();
    await startSession(member.id);
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { ok: true };
});

/** Sends recovery directly to the registered email, without disclosing account existence. */
export const requestPasswordHelp = createServerFn({ method: "POST" })
  .validator(z.object({ identifier: z.string().trim().min(3).max(120) }))
  .handler(async ({ data }) => {
    assertEmailConfigured();
    const id = data.identifier.toLowerCase();
    const [member] = await db
      .select()
      .from(members)
      .where(
        or(
          eq(members.username, id),
          eq(members.email, id),
          eq(members.mobile, data.identifier),
        ),
      )
      .limit(1);
    if (!member?.email) return { ok: true };
    const link = await createEmailResetLink(member.id);
    if (!link) return { ok: true };
    try {
      await sendPasswordResetEmail(member.email, link);
    } catch {
      const token = new URL(link).searchParams.get("token")!;
      await db
        .delete(passwordResets)
        .where(eq(passwordResets.tokenHash, hashToken(token)));
      throw new Error(
        "Reset email could not be sent. Please try again shortly.",
      );
    }
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().min(10).max(100),
      password: z
        .string()
        .min(6, "Password needs at least 6 characters")
        .max(200),
    }),
  )
  .handler(async ({ data }) => {
    const passwordHash = await hashPassword(data.password);
    const memberId = await db.transaction(async (tx) => {
      const [reset] = await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResets.tokenHash, hashToken(data.token)),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, new Date()),
          ),
        )
        .returning({ memberId: passwordResets.memberId });
      if (!reset)
        throw new Error(
          "This reset link is invalid or has expired. Request a new one from the sign-in page.",
        );
      await tx
        .update(members)
        .set({ passwordHash })
        .where(eq(members.id, reset.memberId));
      await tx.delete(sessions).where(eq(sessions.memberId, reset.memberId));
      await tx
        .delete(passwordResets)
        .where(eq(passwordResets.memberId, reset.memberId));
      return reset.memberId;
    });
    await startSession(memberId);
    return { ok: true };
  });
