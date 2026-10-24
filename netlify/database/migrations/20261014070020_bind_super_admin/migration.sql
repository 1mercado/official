-- The admin console is bound to one account: vipbossceo@gmail.com / superadmin.
-- Give that email the reserved username when it is free, then make it the only admin.
UPDATE "members" SET "username" = 'superadmin'
WHERE lower("email") = 'vipbossceo@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM "members" WHERE "username" = 'superadmin');
--> statement-breakpoint
UPDATE "members"
SET "is_admin" = (lower(coalesce("email", '')) = 'vipbossceo@gmail.com' AND "username" = 'superadmin');
