CREATE TABLE "credits" (
	"id" serial PRIMARY KEY,
	"member_id" integer NOT NULL,
	"type" text NOT NULL,
	"source_key" text NOT NULL,
	"source_member_id" integer,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY,
	"member_code" text NOT NULL UNIQUE,
	"username" text NOT NULL UNIQUE,
	"email" text UNIQUE,
	"full_name" text NOT NULL,
	"mobile" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"sponsor_id" integer,
	"parent_id" integer,
	"side" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"entry_status" text DEFAULT 'unpaid' NOT NULL,
	"entry_reference" text,
	"entry_submitted_at" timestamp with time zone,
	"entry_confirmed_at" timestamp with time zone,
	"batch_id" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"member_id" integer PRIMARY KEY,
	"method" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"bank_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_settings" (
	"id" integer PRIMARY KEY,
	"entry_price" integer NOT NULL,
	"required_directs" integer NOT NULL,
	"per_active_account" integer NOT NULL,
	"matching_bonus" integer NOT NULL,
	"matching_levels" integer NOT NULL,
	"earning_cap" integer NOT NULL,
	"daily_withdrawal_limit" integer NOT NULL,
	"min_withdrawal" integer NOT NULL,
	"payment_instructions" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY,
	"member_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY,
	"member_id" integer NOT NULL,
	"reference" text NOT NULL UNIQUE,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"bank_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "credits_source_idx" ON "credits" ("member_id","source_key");--> statement-breakpoint
CREATE INDEX "credits_member_idx" ON "credits" ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "members_parent_idx" ON "members" ("parent_id");--> statement-breakpoint
CREATE INDEX "members_sponsor_idx" ON "members" ("sponsor_id");--> statement-breakpoint
CREATE INDEX "members_entry_idx" ON "members" ("entry_status");--> statement-breakpoint
CREATE INDEX "members_batch_idx" ON "members" ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_slot_idx" ON "members" ("parent_id","side");--> statement-breakpoint
CREATE INDEX "withdrawals_member_idx" ON "withdrawals" ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "withdrawals" ("status");--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;