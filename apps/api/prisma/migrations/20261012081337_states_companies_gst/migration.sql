-- CreateEnum
CREATE TYPE "CompanyEntityType" AS ENUM ('COMPANY', 'SPV', 'JV');

-- CreateEnum
CREATE TYPE "GstRegistrationType" AS ENUM ('REGULAR', 'COMPOSITION', 'SEZ_UNIT', 'CASUAL', 'ISD');

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "gstCode" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "entityType" "CompanyEntityType" NOT NULL,
    "pan" TEXT,
    "tan" TEXT,
    "cin" TEXT,
    "llpin" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateId" UUID,
    "pinCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_gst_registrations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "stateId" UUID NOT NULL,
    "gstin" TEXT NOT NULL,
    "registrationType" "GstRegistrationType" NOT NULL,
    "effectiveFrom" DATE,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "pinCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "company_gst_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_gstCode_key" ON "states"("gstCode");

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_gst_registrations_gstin_key" ON "company_gst_registrations"("gstin");

-- CreateIndex
CREATE INDEX "company_gst_registrations_companyId_idx" ON "company_gst_registrations"("companyId");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_gst_registrations" ADD CONSTRAINT "company_gst_registrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_gst_registrations" ADD CONSTRAINT "company_gst_registrations_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_gst_registrations" ADD CONSTRAINT "company_gst_registrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_gst_registrations" ADD CONSTRAINT "company_gst_registrations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Case-insensitive uniqueness for company codes (Prisma cannot express expression indexes).
CREATE UNIQUE INDEX "companies_code_lower_key" ON "companies" (lower("code"));
