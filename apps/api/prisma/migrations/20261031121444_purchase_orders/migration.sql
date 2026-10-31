-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderSource" AS ENUM ('COMPARISON', 'DIRECT');

-- CreateEnum
CREATE TYPE "PurchaseOrderTaxType" AS ENUM ('CGST_SGST', 'IGST', 'NONE');

-- CreateEnum
CREATE TYPE "PurchaseOrderChargeType" AS ENUM ('FREIGHT', 'LOADING_UNLOADING', 'OTHER');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'PURCHASE_ORDER';

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "revisionNo" SMALLINT NOT NULL DEFAULT 0,
    "revisedFromId" UUID,
    "fiscalYear" TEXT,
    "source" "PurchaseOrderSource" NOT NULL,
    "companyId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "storeId" UUID,
    "comparisonId" UUID,
    "vendorId" UUID NOT NULL,
    "vendorGstRegistrationId" UUID,
    "vendorContactId" UUID,
    "billingGstRegistrationId" UUID NOT NULL,
    "taxType" "PurchaseOrderTaxType" NOT NULL,
    "poDate" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "vendorQuoteRef" TEXT,
    "vendorQuoteDate" DATE,
    "deliveryDate" DATE,
    "paymentTermsDays" SMALLINT,
    "remarks" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "chargesAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgstTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "submittedById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelRemarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "itemId" UUID NOT NULL,
    "comparisonLineId" UUID,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxableAmount" DECIMAL(18,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_charges" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "chargeType" "PurchaseOrderChargeType" NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_terms" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "sortOrder" SMALLINT NOT NULL,
    "title" TEXT,
    "text" TEXT,

    CONSTRAINT "purchase_order_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");

-- CreateIndex
CREATE INDEX "purchase_orders_projectId_idx" ON "purchase_orders"("projectId");

-- CreateIndex
CREATE INDEX "purchase_orders_siteId_idx" ON "purchase_orders"("siteId");

-- CreateIndex
CREATE INDEX "purchase_orders_comparisonId_idx" ON "purchase_orders"("comparisonId");

-- CreateIndex
CREATE INDEX "purchase_orders_vendorId_idx" ON "purchase_orders"("vendorId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_poDate_idx" ON "purchase_orders"("poDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_revision_key" ON "purchase_orders"("number", "revisionNo");

-- CreateIndex
CREATE INDEX "purchase_order_lines_itemId_idx" ON "purchase_order_lines"("itemId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_comparisonLineId_idx" ON "purchase_order_lines"("comparisonLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchaseOrderId_lineNo_key" ON "purchase_order_lines"("purchaseOrderId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchaseOrderId_comparisonLineId_key" ON "purchase_order_lines"("purchaseOrderId", "comparisonLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_charges_purchaseOrderId_chargeType_key" ON "purchase_order_charges"("purchaseOrderId", "chargeType");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_terms_purchaseOrderId_sortOrder_key" ON "purchase_order_terms"("purchaseOrderId", "sortOrder");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "comparisons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorGstRegistrationId_fkey" FOREIGN KEY ("vendorGstRegistrationId") REFERENCES "vendor_gst_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorContactId_fkey" FOREIGN KEY ("vendorContactId") REFERENCES "vendor_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_billingGstRegistrationId_fkey" FOREIGN KEY ("billingGstRegistrationId") REFERENCES "company_gst_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_revisedFromId_fkey" FOREIGN KEY ("revisedFromId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_comparisonLineId_fkey" FOREIGN KEY ("comparisonLineId") REFERENCES "comparison_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_charges" ADD CONSTRAINT "purchase_order_charges_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_terms" ADD CONSTRAINT "purchase_order_terms_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (PD-053, PD-003, PD-006). Prisma cannot express CHECK constraints or partial indexes.
-- G-12 replaces purchase_orders_number_status_check when Approved / Rejected / Superseded are added.
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_number_status_check" CHECK (
     ("status" = 'DRAFT' AND "revisionNo" = 0 AND "number" IS NULL)
  OR ("status" = 'DRAFT' AND "revisionNo" > 0 AND "number" IS NOT NULL)
  OR ("status" = 'SUBMITTED' AND "number" IS NOT NULL)
  OR "status" = 'CANCELLED'
);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_number_fiscal_year_check"
  CHECK (("number" IS NULL) = ("fiscalYear" IS NULL));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_revision_check"
  CHECK ("revisionNo" >= 0 AND (("revisionNo" = 0) = ("revisedFromId" IS NULL)));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_source_check"
  CHECK (("source" = 'COMPARISON') = ("comparisonId" IS NOT NULL));
-- Unregistered vendor (no GST row) = no GST (OQ-71).
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tax_type_check"
  CHECK (("taxType" = 'NONE') = ("vendorGstRegistrationId" IS NULL));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_dates_check" CHECK (
      ("deliveryDate" IS NULL OR "deliveryDate" >= "poDate")
  AND ("vendorQuoteDate" IS NULL OR "vendorQuoteDate" <= "poDate")
  AND ("paymentTermsDays" IS NULL OR "paymentTermsDays" BETWEEN 0 AND 365)
);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_totals_check" CHECK (
      "subtotal" >= 0 AND "chargesAmount" >= 0
  AND "cgstTotal" >= 0 AND "sgstTotal" >= 0 AND "igstTotal" >= 0
  AND "taxTotal" = "cgstTotal" + "sgstTotal" + "igstTotal"
  AND "grandTotal" = "subtotal" + "chargesAmount" + "taxTotal"
  AND ("taxType" <> 'CGST_SGST' OR ("igstTotal" = 0 AND "cgstTotal" = "sgstTotal"))
  AND ("taxType" <> 'IGST' OR ("cgstTotal" = 0 AND "sgstTotal" = 0))
  AND ("taxType" <> 'NONE' OR "taxTotal" = 0)
);

-- One live original PO per comparison + vendor (OQ-83). Cancel frees it; G-12 revisions carry revisedFromId.
CREATE UNIQUE INDEX "purchase_orders_one_live_per_comparison_vendor"
  ON "purchase_orders" ("comparisonId", "vendorId")
  WHERE "status" <> 'CANCELLED' AND "revisedFromId" IS NULL;

ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_values_check" CHECK (
      "lineNo" >= 1 AND "quantity" > 0 AND "rate" >= 0
  AND "discountPercent" BETWEEN 0 AND 100 AND "gstRate" BETWEEN 0 AND 100
  AND "taxableAmount" >= 0 AND "cgstAmount" >= 0 AND "sgstAmount" >= 0 AND "igstAmount" >= 0
  AND "lineTotal" = "taxableAmount" + "cgstAmount" + "sgstAmount" + "igstAmount"
);

ALTER TABLE "purchase_order_charges" ADD CONSTRAINT "purchase_order_charges_values_check" CHECK (
      "amount" >= 0 AND "gstRate" BETWEEN 0 AND 100
  AND "cgstAmount" >= 0 AND "sgstAmount" >= 0 AND "igstAmount" >= 0
);

ALTER TABLE "purchase_order_terms" ADD CONSTRAINT "purchase_order_terms_values_check"
  CHECK ("sortOrder" >= 1 AND ("title" IS NOT NULL OR "text" IS NOT NULL));
