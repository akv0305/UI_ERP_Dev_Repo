-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INDENT');

-- CreateEnum
CREATE TYPE "IndentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "document_series" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "projectId" UUID,
    "fiscalYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indents" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "fiscalYear" TEXT,
    "companyId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "storeId" UUID,
    "indentDate" DATE NOT NULL,
    "requiredByDate" DATE,
    "requestedBy" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "IndentStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "submittedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "decisionRemarks" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelRemarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "indents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indent_lines" (
    "id" UUID NOT NULL,
    "indentId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "itemId" UUID NOT NULL,
    "requiredQty" DECIMAL(18,3) NOT NULL,
    "approvedQty" DECIMAL(18,3),
    "purpose" TEXT,
    "remarks" TEXT,

    CONSTRAINT "indent_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indents_number_key" ON "indents"("number");

-- CreateIndex
CREATE INDEX "indents_companyId_idx" ON "indents"("companyId");

-- CreateIndex
CREATE INDEX "indents_projectId_idx" ON "indents"("projectId");

-- CreateIndex
CREATE INDEX "indents_siteId_idx" ON "indents"("siteId");

-- CreateIndex
CREATE INDEX "indents_status_idx" ON "indents"("status");

-- CreateIndex
CREATE INDEX "indents_indentDate_idx" ON "indents"("indentDate");

-- CreateIndex
CREATE INDEX "indent_lines_itemId_idx" ON "indent_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "indent_lines_indentId_lineNo_key" ON "indent_lines"("indentId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "indent_lines_indentId_itemId_key" ON "indent_lines"("indentId", "itemId");

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "indents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written (PD-003, PD-046). Prisma cannot express NULLS NOT DISTINCT or CHECK constraints.
-- Company-level series (projectId NULL) must also be unique, same approach as user_roles_assignment_key.
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_key"
  UNIQUE NULLS NOT DISTINCT ("companyId", "documentType", "projectId", "fiscalYear");
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_last_number_check"
  CHECK ("lastNumber" >= 0);
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_fiscal_year_check"
  CHECK ("fiscalYear" ~ '^[0-9]{4}-[0-9]{2}$');

-- Drafts are unnumbered; submitted documents always carry a number; a cancelled Draft has none.
ALTER TABLE "indents" ADD CONSTRAINT "indents_number_status_check" CHECK (
     ("status" = 'DRAFT' AND "number" IS NULL)
  OR ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED') AND "number" IS NOT NULL)
  OR "status" = 'CANCELLED'
);
ALTER TABLE "indents" ADD CONSTRAINT "indents_number_fiscal_year_check"
  CHECK (("number" IS NULL) = ("fiscalYear" IS NULL));
ALTER TABLE "indents" ADD CONSTRAINT "indents_required_by_check"
  CHECK ("requiredByDate" IS NULL OR "requiredByDate" >= "indentDate");

ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_line_no_check" CHECK ("lineNo" >= 1);
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_required_qty_check" CHECK ("requiredQty" > 0);
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_approved_qty_check"
  CHECK ("approvedQty" IS NULL OR ("approvedQty" >= 0 AND "approvedQty" <= "requiredQty"));
