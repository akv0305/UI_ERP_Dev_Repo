import { Module } from '@nestjs/common';
import { PurchaseOrderOptionsService } from './purchase-order-options.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrderOptionsService],
})
export class PurchaseOrdersModule {}
