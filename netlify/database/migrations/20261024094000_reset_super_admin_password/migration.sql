-- Reset the admin account (superadmin / vipbossceo@gmail.com) to the default password 123456
-- and sign out its existing sessions so the new password takes effect everywhere.
UPDATE "members"
SET "password_hash" = 'scrypt$d23a31ef152dcf541fcaca53e95d4c8b$ffc8b8d209ec445d3c5afde5b9f17380f646ab611d35bfcecca69cb7bdb6bb84467bd92570047b65c57614505d04705631f1830a35e430a6c9281d2f6c1844d3', "reset_requested_at" = NULL
WHERE lower("username") = 'superadmin' OR lower(coalesce("email", '')) = 'vipbossceo@gmail.com';
--> statement-breakpoint
DELETE FROM "sessions"
WHERE "member_id" IN (SELECT "id" FROM "members" WHERE lower("username") = 'superadmin' OR lower(coalesce("email", '')) = 'vipbossceo@gmail.com');
