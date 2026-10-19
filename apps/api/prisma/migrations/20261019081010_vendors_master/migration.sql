-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('SUPPLIER', 'SUBCONTRACTOR', 'SERVICE_PROVIDER', 'TRANSPORTER');

-- CreateEnum
CREATE TYPE "MsmeCategory" AS ENUM ('MICRO', 'SMALL', 'MEDIUM');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "vendorType" "VendorType" NOT NULL,
    "pan" TEXT,
    "udyamNumber" TEXT,
    "msmeCategory" "MsmeCategory",
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateId" UUID,
    "pinCode" TEXT,
    "paymentTermsDays" SMALLINT,
    "creditLimit" DECIMAL(14,2),
    "remarks" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "submittedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "decisionRemarks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_gst_registrations" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
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

    CONSTRAINT "vendor_gst_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bank_accounts" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "vendor_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contacts" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_code_key" ON "vendors"("code");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_stateId_idx" ON "vendors"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_gst_registrations_gstin_key" ON "vendor_gst_registrations"("gstin");

-- CreateIndex
CREATE INDEX "vendor_gst_registrations_vendorId_idx" ON "vendor_gst_registrations"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_bank_accounts_vendorId_idx" ON "vendor_bank_accounts"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bank_accounts_vendorId_ifsc_accountNumber_key" ON "vendor_bank_accounts"("vendorId", "ifsc", "accountNumber");

-- CreateIndex
CREATE INDEX "vendor_contacts_vendorId_idx" ON "vendor_contacts"("vendorId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_gst_registrations" ADD CONSTRAINT "vendor_gst_registrations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_gst_registrations" ADD CONSTRAINT "vendor_gst_registrations_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_gst_registrations" ADD CONSTRAINT "vendor_gst_registrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_gst_registrations" ADD CONSTRAINT "vendor_gst_registrations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written (PD-044, OQ-35). Prisma cannot express partial indexes or CHECK constraints.
-- PAN and Udyam are stored uppercase, so plain partial unique indexes are enough.
CREATE UNIQUE INDEX "vendors_pan_key" ON "vendors" ("pan") WHERE "pan" IS NOT NULL;
CREATE UNIQUE INDEX "vendors_udyam_key" ON "vendors" ("udyamNumber") WHERE "udyamNumber" IS NOT NULL;

ALTER TABLE "vendors" ADD CONSTRAINT "vendors_msme_pair_check"
  CHECK (("udyamNumber" IS NULL) = ("msmeCategory" IS NULL));
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_payment_terms_check"
  CHECK ("paymentTermsDays" IS NULL OR "paymentTermsDays" BETWEEN 0 AND 365);
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_credit_limit_check"
  CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0);

-- One active primary bank account and one active primary contact per vendor.
CREATE UNIQUE INDEX "vendor_bank_accounts_one_primary_key"
  ON "vendor_bank_accounts" ("vendorId") WHERE "isPrimary" AND "isActive";
CREATE UNIQUE INDEX "vendor_contacts_one_primary_key"
  ON "vendor_contacts" ("vendorId") WHERE "isPrimary" AND "isActive";
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_primary_active_check"
  CHECK (NOT "isPrimary" OR "isActive");
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_primary_active_check"
  CHECK (NOT "isPrimary" OR "isActive");
