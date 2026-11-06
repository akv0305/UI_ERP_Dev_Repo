-- This is an empty migration.-- Hand-written (PD-055 part 2). Uses the enum values added by po_approval_workflows.
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_number_status_check";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_number_status_check" CHECK (
     ("status" = 'DRAFT' AND "revisionNo" = 0 AND "number" IS NULL)
  OR ("status" = 'DRAFT' AND "revisionNo" > 0 AND "number" IS NOT NULL)
  OR ("status" IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED') AND "number" IS NOT NULL)
  OR "status" = 'CANCELLED'
);
-- Submitted POs from before G-12 have no workflow (left as is, OQ-104), so only Approved/Rejected require one.
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approval_check" CHECK (
      "approvalCycle" >= 0
  AND ("status" <> 'APPROVED' OR "approvedAt" IS NOT NULL)
  AND (("status" = 'SUPERSEDED') = ("supersededAt" IS NOT NULL))
  AND ("status" NOT IN ('APPROVED', 'REJECTED') OR "approvalWorkflowId" IS NOT NULL)
);
