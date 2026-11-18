-- CreateEnum
CREATE TYPE "WorkLocationType" AS ENUM ('HEAD_OFFICE', 'PROJECT');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "emailDomain" TEXT;

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "companyId" UUID NOT NULL,
    "designationId" UUID,
    "workLocationType" "WorkLocationType",
    "projectId" UUID,
    "siteId" UUID,
    "dateOfJoining" DATE,
    "dateOfLeaving" DATE,
    "officialEmail" TEXT,
    "mobile" TEXT,
    "userId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designations_code_key" ON "designations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeNo_key" ON "employees"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE INDEX "employees_designationId_idx" ON "employees"("designationId");

-- CreateIndex
CREATE INDEX "employees_projectId_idx" ON "employees"("projectId");

-- CreateIndex
CREATE INDEX "employees_siteId_idx" ON "employees"("siteId");

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (G-14). Prisma cannot express expression or partial indexes, or CHECK constraints.
-- Employee code unique across all companies, ignoring case and spaces (OQ-136).
CREATE UNIQUE INDEX "employees_code_normalized_key"
  ON "employees" (upper(regexp_replace("code", '\s', '', 'g')));
-- Official email unique when entered, ignoring case (OQ-143 b).
CREATE UNIQUE INDEX "employees_official_email_lower_key"
  ON "employees" (lower("officialEmail")) WHERE "officialEmail" IS NOT NULL;
-- Designation name unique ignoring case (OQ-143 a).
CREATE UNIQUE INDEX "designations_name_lower_key" ON "designations" (lower("name"));

-- Work location: blank, Head Office (no project/site), or Project (project required, site optional) (OQ-138).
-- The site belonging to that project is checked by the API.
ALTER TABLE "employees" ADD CONSTRAINT "employees_work_location_check" CHECK (
  ("workLocationType" IS NULL AND "projectId" IS NULL AND "siteId" IS NULL)
  OR ("workLocationType" = 'HEAD_OFFICE' AND "projectId" IS NULL AND "siteId" IS NULL)
  OR ("workLocationType" = 'PROJECT' AND "projectId" IS NOT NULL)
);
ALTER TABLE "employees" ADD CONSTRAINT "employees_dates_check" CHECK (
  "dateOfLeaving" IS NULL OR "dateOfJoining" IS NULL OR "dateOfLeaving" >= "dateOfJoining"
);

-- Company official email domain, lowercase, without "@" (OQ-91).
ALTER TABLE "companies" ADD CONSTRAINT "companies_email_domain_check" CHECK (
  "emailDomain" IS NULL
  OR "emailDomain" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
);
