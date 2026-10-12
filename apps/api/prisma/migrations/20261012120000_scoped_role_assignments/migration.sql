-- Scoped role assignments (G-04b). Non-destructive: no table is dropped and no row is lost.
-- Existing (userId, roleId) links become GLOBAL assignments with a generated id.

-- CreateEnum
CREATE TYPE "RoleScopeType" AS ENUM ('GLOBAL', 'COMPANY', 'PROJECT', 'SITE');

-- AlterTable: session context (current company / project)
ALTER TABLE "sessions" ADD COLUMN     "currentCompanyId" UUID,
ADD COLUMN     "currentProjectId" UUID;

-- AlterTable: new user_roles columns. "id" starts nullable so existing rows can be backfilled.
ALTER TABLE "user_roles" ADD COLUMN     "companyId" UUID,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "id" UUID,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "scopeType" "RoleScopeType" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "siteId" UUID;

-- Backfill: every existing row gets an id; scopeType already defaulted to GLOBAL (all targets NULL).
UPDATE "user_roles" SET "id" = gen_random_uuid() WHERE "id" IS NULL;

-- Swap the primary key from ("userId", "roleId") to "id".
ALTER TABLE "user_roles" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_pkey";
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");

-- Scope shape: GLOBAL has no target; COMPANY / PROJECT / SITE have exactly their own target.
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_target_check" CHECK (
    ("scopeType" = 'GLOBAL'  AND "companyId" IS NULL     AND "projectId" IS NULL     AND "siteId" IS NULL)
 OR ("scopeType" = 'COMPANY' AND "companyId" IS NOT NULL AND "projectId" IS NULL     AND "siteId" IS NULL)
 OR ("scopeType" = 'PROJECT' AND "companyId" IS NULL     AND "projectId" IS NOT NULL AND "siteId" IS NULL)
 OR ("scopeType" = 'SITE'    AND "companyId" IS NULL     AND "projectId" IS NULL     AND "siteId" IS NOT NULL)
);

-- One assignment per user, role and scope; NULL targets compare equal so GLOBAL duplicates are rejected.
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assignment_key"
    UNIQUE NULLS NOT DISTINCT ("userId", "roleId", "scopeType", "companyId", "projectId", "siteId");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE INDEX "user_roles_companyId_idx" ON "user_roles"("companyId");

-- CreateIndex
CREATE INDEX "user_roles_projectId_idx" ON "user_roles"("projectId");

-- CreateIndex
CREATE INDEX "user_roles_siteId_idx" ON "user_roles"("siteId");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_currentCompanyId_fkey" FOREIGN KEY ("currentCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_currentProjectId_fkey" FOREIGN KEY ("currentProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
