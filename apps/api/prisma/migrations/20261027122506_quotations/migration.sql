-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationChargeType" AS ENUM ('FREIGHT', 'LOADING_UNLOADING', 'OTHER');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'QUOTATION';

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "revisionNo" SMALLINT NOT NULL DEFAULT 0,
    "revisedFromId" UUID,
    "fiscalYear" TEXT,
    "companyId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "vendorQuoteRef" TEXT,
    "quoteDate" DATE NOT NULL,
    "validUntil" DATE,
    "deliveryDays" SMALLINT,
    "paymentTermsDays" SMALLINT,
    "remarks" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "chargesTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "submittedById" UUID,
    "supersededAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelRemarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "enquiryLineId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "isQuoted" BOOLEAN NOT NULL DEFAULT false,
    "rate" DECIMAL(18,4),
    "discountPercent" DECIMAL(5,2),
    "gstRate" DECIMAL(5,2),
    "taxableAmount" DECIMAL(18,2),
    "taxAmount" DECIMAL(18,2),
    "lineTotal" DECIMAL(18,2),
    "makeBrand" TEXT,
    "remarks" TEXT,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_charges" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "chargeType" "QuotationChargeType" NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "quotation_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotations_companyId_idx" ON "quotations"("companyId");

-- CreateIndex
CREATE INDEX "quotations_projectId_idx" ON "quotations"("projectId");

-- CreateIndex
CREATE INDEX "quotations_enquiryId_idx" ON "quotations"("enquiryId");

-- CreateIndex
CREATE INDEX "quotations_vendorId_idx" ON "quotations"("vendorId");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_number_revision_key" ON "quotations"("number", "revisionNo");

-- CreateIndex
CREATE INDEX "quotation_lines_enquiryLineId_idx" ON "quotation_lines"("enquiryLineId");

-- CreateIndex
CREATE INDEX "quotation_lines_itemId_idx" ON "quotation_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_lines_quotationId_lineNo_key" ON "quotation_lines"("quotationId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_lines_quotationId_enquiryLineId_key" ON "quotation_lines"("quotationId", "enquiryLineId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_charges_quotationId_chargeType_key" ON "quotation_charges"("quotationId", "chargeType");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_revisedFromId_fkey" FOREIGN KEY ("revisedFromId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_enquiryLineId_fkey" FOREIGN KEY ("enquiryLineId") REFERENCES "enquiry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_charges" ADD CONSTRAINT "quotation_charges_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (PD-049, PD-003, PD-006). Prisma cannot express CHECK constraints or partial indexes.
-- A first-time Draft is unnumbered; a revision Draft keeps the number; submitted/superseded always numbered.
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_number_status_check" CHECK (
     ("status" = 'DRAFT' AND "revisionNo" = 0 AND "number" IS NULL)
  OR ("status" = 'DRAFT' AND "revisionNo" > 0 AND "number" IS NOT NULL)
  OR ("status" IN ('SUBMITTED', 'SUPERSEDED') AND "number" IS NOT NULL)
  OR "status" = 'CANCELLED'
);
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_number_fiscal_year_check"
  CHECK (("number" IS NULL) = ("fiscalYear" IS NULL));
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_revision_check"
  CHECK ("revisionNo" >= 0 AND (("revisionNo" = 0) = ("revisedFromId" IS NULL)));
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_valid_until_check"
  CHECK ("validUntil" IS NULL OR "validUntil" >= "quoteDate");
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_days_check" CHECK (
      ("deliveryDays" IS NULL OR "deliveryDays" BETWEEN 0 AND 365)
  AND ("paymentTermsDays" IS NULL OR "paymentTermsDays" BETWEEN 0 AND 365)
);
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_totals_check" CHECK (
      "subtotal" >= 0 AND "taxTotal" >= 0 AND "chargesTotal" >= 0
  AND "grandTotal" = "subtotal" + "taxTotal" + "chargesTotal"
);

-- One Submitted and one Draft quotation per vendor per enquiry (OQ-54).
CREATE UNIQUE INDEX "quotations_one_submitted_per_vendor"
  ON "quotations"("enquiryId", "vendorId") WHERE "status" = 'SUBMITTED';
CREATE UNIQUE INDEX "quotations_one_draft_per_vendor"
  ON "quotations"("enquiryId", "vendorId") WHERE "status" = 'DRAFT';

ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_line_no_check" CHECK ("lineNo" >= 1);
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quoted_check" CHECK (
     ("isQuoted" AND "rate" IS NOT NULL AND "discountPercent" IS NOT NULL AND "gstRate" IS NOT NULL
      AND "taxableAmount" IS NOT NULL AND "taxAmount" IS NOT NULL AND "lineTotal" IS NOT NULL)
  OR (NOT "isQuoted" AND "rate" IS NULL AND "discountPercent" IS NULL AND "gstRate" IS NULL
      AND "taxableAmount" IS NULL AND "taxAmount" IS NULL AND "lineTotal" IS NULL)
);
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_values_check" CHECK (
      ("rate" IS NULL OR "rate" >= 0)
  AND ("discountPercent" IS NULL OR "discountPercent" BETWEEN 0 AND 100)
  AND ("gstRate" IS NULL OR "gstRate" BETWEEN 0 AND 100)
  AND ("taxableAmount" IS NULL OR "taxableAmount" >= 0)
  AND ("taxAmount" IS NULL OR "taxAmount" >= 0)
);

ALTER TABLE "quotation_charges" ADD CONSTRAINT "quotation_charges_values_check" CHECK (
  "amount" >= 0 AND "gstRate" BETWEEN 0 AND 100 AND "taxAmount" >= 0
);
