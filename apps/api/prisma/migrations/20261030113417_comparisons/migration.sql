-- CreateEnum
CREATE TYPE "ComparisonStatus" AS ENUM ('DRAFT', 'FINALISED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'COMPARISON';

-- CreateTable
CREATE TABLE "comparisons" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "fiscalYear" TEXT,
    "companyId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "comparisonDate" DATE NOT NULL,
    "remarks" TEXT,
    "status" "ComparisonStatus" NOT NULL DEFAULT 'DRAFT',
    "finalisedAt" TIMESTAMPTZ(3),
    "finalisedById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelRemarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_lines" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "enquiryLineId" UUID NOT NULL,
    "selectedVendorId" UUID,
    "reason" TEXT,
    "quotationLineId" UUID,
    "netRate" DECIMAL(18,4),
    "rank" SMALLINT,

    CONSTRAINT "comparison_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_quotations" (
    "comparisonId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,

    CONSTRAINT "comparison_quotations_pkey" PRIMARY KEY ("comparisonId","quotationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_number_key" ON "comparisons"("number");

-- CreateIndex
CREATE INDEX "comparisons_companyId_idx" ON "comparisons"("companyId");

-- CreateIndex
CREATE INDEX "comparisons_projectId_idx" ON "comparisons"("projectId");

-- CreateIndex
CREATE INDEX "comparisons_enquiryId_idx" ON "comparisons"("enquiryId");

-- CreateIndex
CREATE INDEX "comparisons_status_idx" ON "comparisons"("status");

-- CreateIndex
CREATE INDEX "comparison_lines_enquiryLineId_idx" ON "comparison_lines"("enquiryLineId");

-- CreateIndex
CREATE INDEX "comparison_lines_selectedVendorId_idx" ON "comparison_lines"("selectedVendorId");

-- CreateIndex
CREATE INDEX "comparison_lines_quotationLineId_idx" ON "comparison_lines"("quotationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "comparison_lines_comparisonId_enquiryLineId_key" ON "comparison_lines"("comparisonId", "enquiryLineId");

-- CreateIndex
CREATE INDEX "comparison_quotations_quotationId_idx" ON "comparison_quotations"("quotationId");

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_finalisedById_fkey" FOREIGN KEY ("finalisedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "comparisons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_enquiryLineId_fkey" FOREIGN KEY ("enquiryLineId") REFERENCES "enquiry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_selectedVendorId_fkey" FOREIGN KEY ("selectedVendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_quotationLineId_fkey" FOREIGN KEY ("quotationLineId") REFERENCES "quotation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_quotations" ADD CONSTRAINT "comparison_quotations_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "comparisons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_quotations" ADD CONSTRAINT "comparison_quotations_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open (Draft or Finalised) comparison per enquiry (PD-050).
CREATE UNIQUE INDEX "comparisons_one_open_per_enquiry"
  ON "comparisons" ("enquiryId") WHERE "status" <> 'CANCELLED';

-- A Finalised comparison always has its number and finalise time.
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_finalised_check"
  CHECK ("status" <> 'FINALISED' OR ("number" IS NOT NULL AND "finalisedAt" IS NOT NULL));

-- Reason only with a chosen vendor.
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_reason_check"
  CHECK ("reason" IS NULL OR "selectedVendorId" IS NOT NULL);

-- Finalise fills quotation line, net rate and rank together, and only for a chosen vendor.
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_snapshot_check"
  CHECK (
    ("quotationLineId" IS NULL AND "netRate" IS NULL AND "rank" IS NULL)
    OR ("quotationLineId" IS NOT NULL AND "netRate" IS NOT NULL AND "rank" IS NOT NULL
        AND "selectedVendorId" IS NOT NULL)
  );

ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_values_check"
  CHECK (("netRate" IS NULL OR "netRate" >= 0) AND ("rank" IS NULL OR "rank" >= 1));

-- Not L1 needs a reason (OQ-63).
ALTER TABLE "comparison_lines" ADD CONSTRAINT "comparison_lines_non_l1_reason_check"
  CHECK ("rank" IS NULL OR "rank" = 1 OR "reason" IS NOT NULL);
