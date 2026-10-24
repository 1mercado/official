-- Bind the console to the existing username account without changing its email or credentials.
UPDATE "members"
SET "is_admin" = (lower("username") = 'vipbossceo');
