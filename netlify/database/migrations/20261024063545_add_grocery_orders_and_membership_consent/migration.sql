CREATE TABLE "grocery_orders" (
	"id" serial PRIMARY KEY,
	"member_id" integer NOT NULL,
	"request_key" text NOT NULL UNIQUE,
	"items" text NOT NULL,
	"total_centavos" integer NOT NULL,
	"contact" text NOT NULL,
	"address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_products" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"price_centavos" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "membership_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "membership_consent_version" text;--> statement-breakpoint
ALTER TABLE "grocery_orders" ADD CONSTRAINT "grocery_orders_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id");