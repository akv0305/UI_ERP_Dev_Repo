import { Module } from '@nestjs/common';
import { PurchaseOrderApprovalsService } from './purchase-order-approvals.service';

/** Shared by purchase orders, users and roles (OQ-99, OQ-117). */
@Module({
  providers: [PurchaseOrderApprovalsService],
  exports: [PurchaseOrderApprovalsService],
})
export class PurchaseOrderApprovalsModule {}
