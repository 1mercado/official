import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Every account in the plan. The binary tree uses parentId + side; sponsorId is who referred them. */
export const members = pgTable(
  "members",
  {
    id: serial().primaryKey(),
    memberCode: text("member_code").notNull().unique(),
    username: text().notNull().unique(),
    email: text().unique(),
    fullName: text("full_name").notNull(),
    mobile: text().notNull().default(""),
    city: text().notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    membershipConsentAt: timestamp("membership_consent_at", {
      withTimezone: true,
    }),
    membershipConsentVersion: text("membership_consent_version"),
    sponsorId: integer("sponsor_id"),
    parentId: integer("parent_id"),
    side: text().$type<"left" | "right">(),
    depth: integer().notNull().default(0),
    entryStatus: text("entry_status")
      .$type<"unpaid" | "pending" | "confirmed" | "rejected">()
      .notNull()
      .default("unpaid"),
    entryReference: text("entry_reference"),
    entrySubmittedAt: timestamp("entry_submitted_at", { withTimezone: true }),
    entryConfirmedAt: timestamp("entry_confirmed_at", { withTimezone: true }),
    batchId: text("batch_id"),
    isActive: boolean("is_active").notNull().default(false),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    isAdmin: boolean("is_admin").notNull().default(false),
    isSuspended: boolean("is_suspended").notNull().default(false),
    resetRequestedAt: timestamp("reset_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("members_parent_idx").on(t.parentId),
    index("members_sponsor_idx").on(t.sponsorId),
    index("members_entry_idx").on(t.entryStatus),
    index("members_batch_idx").on(t.batchId),
    uniqueIndex("members_slot_idx").on(t.parentId, t.side),
  ],
);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** One-time password reset links, created by an admin and shared with the member. */
export const passwordResets = pgTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Wallet credits. `sourceKey` makes every credit idempotent: `active:<memberId>` for an
 * active-account credit, `pair:<n>` for the n-th matching pair, or a random key for adjustments.
 */
export const credits = pgTable(
  "credits",
  {
    id: serial().primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    type: text().$type<"active" | "matching" | "adjustment">().notNull(),
    sourceKey: text("source_key").notNull(),
    sourceMemberId: integer("source_member_id"),
    description: text().notNull(),
    amount: integer().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("credits_source_idx").on(t.memberId, t.sourceKey),
    index("credits_member_idx").on(t.memberId, t.createdAt),
  ],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: serial().primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    reference: text().notNull().unique(),
    amount: integer().notNull(),
    method: text().notNull(),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number").notNull(),
    bankName: text("bank_name"),
    status: text()
      .$type<"pending" | "approved" | "paid" | "rejected">()
      .notNull()
      .default("pending"),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("withdrawals_member_idx").on(t.memberId, t.createdAt),
    index("withdrawals_status_idx").on(t.status),
  ],
);

export const payoutAccounts = pgTable("payout_accounts", {
  memberId: integer("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  method: text().$type<"GCash" | "Maya" | "DigiCash" | "Bank">().notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  bankName: text("bank_name"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Single row (id = 1) holding the editable compensation plan. */
export const planSettings = pgTable("plan_settings", {
  id: integer().primaryKey(),
  entryPrice: integer("entry_price").notNull(),
  requiredDirects: integer("required_directs").notNull(),
  perActiveAccount: integer("per_active_account").notNull(),
  matchingBonus: integer("matching_bonus").notNull(),
  matchingLevels: integer("matching_levels").notNull(),
  earningCap: integer("earning_cap").notNull(),
  dailyWithdrawalLimit: integer("daily_withdrawal_limit").notNull(),
  minWithdrawal: integer("min_withdrawal").notNull(),
  paymentInstructions: text("payment_instructions").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Single-use activation codes generated in the admin console. Every sign-up must redeem one, and
 * redeeming it counts as the paid entry (the account is confirmed straight away).
 */
export const activationCodes = pgTable(
  "activation_codes",
  {
    id: serial().primaryKey(),
    code: text().notNull().unique(),
    status: text()
      .$type<"unused" | "used" | "void">()
      .notNull()
      .default("unused"),
    note: text(),
    batchId: text("batch_id").notNull(),
    createdBy: integer("created_by").references(() => members.id, {
      onDelete: "set null",
    }),
    usedBy: integer("used_by").references(() => members.id, {
      onDelete: "set null",
    }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activation_codes_status_idx").on(t.status, t.createdAt),
    index("activation_codes_used_by_idx").on(t.usedBy),
  ],
);

export const groceryProducts = pgTable("grocery_products", {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  category: text().notNull(),
  unit: text().notNull(),
  priceCentavos: integer("price_centavos").notNull(),
  available: boolean().notNull().default(true),
});
export const groceryOrders = pgTable("grocery_orders", {
  id: serial().primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id),
  requestKey: text("request_key").notNull().unique(),
  items: text().notNull(),
  totalCentavos: integer("total_centavos").notNull(),
  contact: text().notNull(),
  address: text().notNull(),
  status: text()
    .$type<"pending" | "confirmed" | "fulfilled" | "cancelled">()
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
