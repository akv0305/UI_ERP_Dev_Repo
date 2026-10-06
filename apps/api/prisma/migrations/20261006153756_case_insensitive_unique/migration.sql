-- Case-insensitive uniqueness for username and email (Prisma cannot express expression indexes).
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username"));
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
