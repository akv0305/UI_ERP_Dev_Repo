import { Module } from '@nestjs/common';
import { PurchaseOrderApprovalsModule } from '../purchase-order-approvals/purchase-order-approvals.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [PurchaseOrderApprovalsModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
