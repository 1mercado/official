import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import {
  deleteCookie,
  getCookie,
  getRequestUrl,
  setCookie,
} from "@tanstack/react-start/server";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { members, passwordResets, sessions } from "../../db/schema.js";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "om_session";
const SESSION_DAYS = 30;

export type MemberRow = typeof members.$inferSelect;

export class AuthRequiredError extends Error {
  constructor(message = "Please sign in to continue") {
    super(message);
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function startSession(memberId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db
    .insert(sessions)
    .values({ tokenHash: hashToken(token), memberId, expiresAt });
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestUrl().protocol === "https:",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const token = getCookie(COOKIE);
  if (token)
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  deleteCookie(COOKIE, { path: "/" });
}

/** The signed-in member for this request, or null. Suspended accounts are treated as signed out. */
export async function currentMember(): Promise<MemberRow | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const [row] = await db
    .select({ member: members })
    .from(sessions)
    .innerJoin(members, eq(sessions.memberId, members.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.member.isSuspended) return null;
  return row.member;
}

export async function requireMember() {
  const member = await currentMember();
  if (!member) throw new AuthRequiredError();
  return member;
}

/** The admin console belongs to the designated superadmin account. */
export const SUPER_ADMIN_USERNAME = "superadmin";

export const SUPER_ADMIN_EMAIL = "vipbossceo@gmail.com";

export function isSuperAdmin(
  m: Pick<MemberRow, "username" | "email" | "isAdmin">,
) {
  return (
    m.isAdmin &&
    m.username.toLowerCase() === SUPER_ADMIN_USERNAME &&
    m.email?.toLowerCase() === SUPER_ADMIN_EMAIL
  );
}

/** Prevents new accounts from claiming the console owner's username. */
export function assertNotReserved(username: string) {
  if (username.toLowerCase() === SUPER_ADMIN_USERNAME)
    throw new Error(`The username "${SUPER_ADMIN_USERNAME}" is reserved`);
}

export async function requireAdmin() {
  const member = await requireMember();
  if (!isSuperAdmin(member)) throw new Error("Super admin access required");
  return member;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random, unambiguous member code such as OM-7KQ3TZ. Uniqueness is enforced by the database. */
export function newMemberCode() {
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `OM-${code}`;
}

/** Creates a one-time, 24-hour password reset link for a member. */
export async function createResetLink(memberId: number) {
  const token = randomBytes(24).toString("base64url");
  await db.insert(passwordResets).values({
    tokenHash: hashToken(token),
    memberId,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db
    .update(members)
    .set({ resetRequestedAt: null })
    .where(eq(members.id, memberId));
  return `${getRequestUrl().origin}/reset-password?token=${token}`;
}

/** Rate limit recovery per account, including concurrent requests, without queueing admin work. */
export async function createEmailResetLink(memberId: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(42017, ${memberId})`);
    const [recent] = await tx
      .select({ tokenHash: passwordResets.tokenHash })
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.memberId, memberId),
          gt(passwordResets.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
      .limit(1);
    if (recent) return null;
    const token = randomBytes(24).toString("base64url");
    await tx.insert(passwordResets).values({
      tokenHash: hashToken(token),
      memberId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // A fixed trusted origin prevents request-host poisoning of recovery links.
    return `https://1mercado.online/reset-password?token=${token}`;
  });
}
