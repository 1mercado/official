CREATE TABLE "activation_codes" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"status" text DEFAULT 'unused' NOT NULL,
	"note" text,
	"batch_id" text NOT NULL,
	"created_by" integer,
	"used_by" integer,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activation_codes_status_idx" ON "activation_codes" ("status","created_at");--> statement-breakpoint
CREATE INDEX "activation_codes_used_by_idx" ON "activation_codes" ("used_by");--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_created_by_members_id_fkey" FOREIGN KEY ("created_by") REFERENCES "members"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_used_by_members_id_fkey" FOREIGN KEY ("used_by") REFERENCES "members"("id") ON DELETE SET NULL;