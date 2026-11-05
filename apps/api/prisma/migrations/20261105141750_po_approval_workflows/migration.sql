-- CreateEnum
CREATE TYPE "ApprovalDocumentType" AS ENUM ('PURCHASE_ORDER');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'ON_HOLD', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'SAME_APPROVER', 'MAKER_SUBMIT', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('APPROVAL_PENDING', 'APPROVAL_ON_HOLD', 'APPROVER_NEEDED', 'PURCHASE_ORDER_APPROVED', 'PURCHASE_ORDER_REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'REJECTED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "approvalCycle" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "approvalWorkflowId" UUID,
ADD COLUMN     "approvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "supersededAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "documentType" "ApprovalDocumentType" NOT NULL,
    "companyId" UUID,
    "version" SMALLINT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflow_levels" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "levelNo" SMALLINT NOT NULL,
    "roleId" UUID NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "makerCountsAsApproved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "approval_workflow_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "cycleNo" SMALLINT NOT NULL,
    "levelNo" SMALLINT NOT NULL,
    "roleId" UUID NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "approverId" UUID,
    "assignedAt" TIMESTAMPTZ(3),
    "assignedById" UUID,
    "routedRoleId" UUID,
    "routeReason" TEXT,
    "decision" "ApprovalDecision",
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "remarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_delegations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "delegateId" UUID NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "remarks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "purchaseOrderId" UUID,
    "approvalStepId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_workflows_companyId_idx" ON "approval_workflows"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_version_key" ON "approval_workflows"("documentType", "companyId", "version");

-- CreateIndex
CREATE INDEX "approval_workflow_levels_roleId_idx" ON "approval_workflow_levels"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflow_levels_workflowId_levelNo_key" ON "approval_workflow_levels"("workflowId", "levelNo");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflow_levels_workflowId_roleId_key" ON "approval_workflow_levels"("workflowId", "roleId");

-- CreateIndex
CREATE INDEX "approval_steps_approverId_status_idx" ON "approval_steps"("approverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_purchaseOrderId_cycleNo_levelNo_key" ON "approval_steps"("purchaseOrderId", "cycleNo", "levelNo");

-- CreateIndex
CREATE INDEX "approval_delegations_userId_idx" ON "approval_delegations"("userId");

-- CreateIndex
CREATE INDEX "approval_delegations_delegateId_idx" ON "approval_delegations"("delegateId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvalWorkflowId_fkey" FOREIGN KEY ("approvalWorkflowId") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_levels" ADD CONSTRAINT "approval_workflow_levels_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_levels" ADD CONSTRAINT "approval_workflow_levels_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_routedRoleId_fkey" FOREIGN KEY ("routedRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_approvalStepId_fkey" FOREIGN KEY ("approvalStepId") REFERENCES "approval_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (PD-054). Prisma cannot express NULLS NOT DISTINCT, partial indexes or CHECKs.
DROP INDEX "approval_workflows_version_key";
CREATE UNIQUE INDEX "approval_workflows_version_key"
  ON "approval_workflows" ("documentType", "companyId", "version") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "approval_workflows_one_current"
  ON "approval_workflows" ("documentType", "companyId") NULLS NOT DISTINCT WHERE "isCurrent";
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_version_check" CHECK ("version" >= 1);

ALTER TABLE "approval_workflow_levels" ADD CONSTRAINT "approval_workflow_levels_values_check" CHECK (
      "levelNo" >= 1 AND "minAmount" >= 0
  AND ("levelNo" <> 1 OR "minAmount" = 0)
  AND (NOT "makerCountsAsApproved" OR "levelNo" = 1)
);

ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_values_check" CHECK (
      "cycleNo" >= 1 AND "levelNo" >= 1 AND "minAmount" >= 0
  AND (("status" IN ('APPROVED', 'REJECTED')) = ("decision" IS NOT NULL))
  AND (("decision" IS NULL) = ("decidedAt" IS NULL))
  AND ("decision" IS NULL OR (("decision" = 'REJECTED') = ("status" = 'REJECTED')))
  AND ("status" <> 'PENDING' OR "approverId" IS NOT NULL)
  AND (("routedRoleId" IS NULL) = ("routeReason" IS NULL))
);
CREATE UNIQUE INDEX "approval_steps_one_open_per_po"
  ON "approval_steps" ("purchaseOrderId") WHERE "status" IN ('PENDING', 'ON_HOLD');

ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_values_check"
  CHECK ("toDate" >= "fromDate" AND "userId" <> "delegateId");
