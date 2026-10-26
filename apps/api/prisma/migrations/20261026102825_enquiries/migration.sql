-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('DRAFT', 'SENT', 'CLOSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'ENQUIRY';

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "fiscalYear" TEXT,
    "companyId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "enquiryDate" DATE NOT NULL,
    "quoteDueDate" DATE NOT NULL,
    "terms" TEXT,
    "remarks" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMPTZ(3),
    "sentById" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelRemarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_lines" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "indentLineId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "enquiry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_vendors" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_number_key" ON "enquiries"("number");

-- CreateIndex
CREATE INDEX "enquiries_companyId_idx" ON "enquiries"("companyId");

-- CreateIndex
CREATE INDEX "enquiries_projectId_idx" ON "enquiries"("projectId");

-- CreateIndex
CREATE INDEX "enquiries_siteId_idx" ON "enquiries"("siteId");

-- CreateIndex
CREATE INDEX "enquiries_status_idx" ON "enquiries"("status");

-- CreateIndex
CREATE INDEX "enquiries_enquiryDate_idx" ON "enquiries"("enquiryDate");

-- CreateIndex
CREATE INDEX "enquiry_lines_indentLineId_idx" ON "enquiry_lines"("indentLineId");

-- CreateIndex
CREATE INDEX "enquiry_lines_itemId_idx" ON "enquiry_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_lines_enquiryId_lineNo_key" ON "enquiry_lines"("enquiryId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_lines_enquiryId_indentLineId_key" ON "enquiry_lines"("enquiryId", "indentLineId");

-- CreateIndex
CREATE INDEX "enquiry_vendors_vendorId_idx" ON "enquiry_vendors"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_vendors_enquiryId_vendorId_key" ON "enquiry_vendors"("enquiryId", "vendorId");

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_lines" ADD CONSTRAINT "enquiry_lines_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_lines" ADD CONSTRAINT "enquiry_lines_indentLineId_fkey" FOREIGN KEY ("indentLineId") REFERENCES "indent_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_lines" ADD CONSTRAINT "enquiry_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_vendors" ADD CONSTRAINT "enquiry_vendors_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_vendors" ADD CONSTRAINT "enquiry_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (PD-047, PD-003). Prisma cannot express CHECK constraints.
-- Drafts are unnumbered; sent or closed enquiries always carry a number; a cancelled Draft has none.
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_number_status_check" CHECK (
     ("status" = 'DRAFT' AND "number" IS NULL)
  OR ("status" IN ('SENT', 'CLOSED') AND "number" IS NOT NULL)
  OR "status" = 'CANCELLED'
);
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_number_fiscal_year_check"
  CHECK (("number" IS NULL) = ("fiscalYear" IS NULL));
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_quote_due_check"
  CHECK ("quoteDueDate" >= "enquiryDate");

ALTER TABLE "enquiry_lines" ADD CONSTRAINT "enquiry_lines_line_no_check" CHECK ("lineNo" >= 1);
ALTER TABLE "enquiry_lines" ADD CONSTRAINT "enquiry_lines_quantity_check" CHECK ("quantity" > 0);
