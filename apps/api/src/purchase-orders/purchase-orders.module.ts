import { Module } from '@nestjs/common';
import { PurchaseOrderApprovalsService } from '../purchase-order-approvals/purchase-order-approvals.service';
import { PurchaseOrderOptionsService } from './purchase-order-options.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrderOptionsService, PurchaseOrderApprovalsService],
})
export class PurchaseOrdersModule {}
