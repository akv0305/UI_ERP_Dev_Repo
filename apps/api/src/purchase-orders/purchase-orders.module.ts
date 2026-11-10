import { Module } from '@nestjs/common';
import { PurchaseOrderApprovalsModule } from '../purchase-order-approvals/purchase-order-approvals.module';
import { PurchaseOrderOptionsService } from './purchase-order-options.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [PurchaseOrderApprovalsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrderOptionsService],
})
export class PurchaseOrdersModule {}
