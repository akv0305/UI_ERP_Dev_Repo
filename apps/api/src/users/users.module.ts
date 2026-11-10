import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PurchaseOrderApprovalsModule } from '../purchase-order-approvals/purchase-order-approvals.module';

@Module({
  imports: [AuthModule, PurchaseOrderApprovalsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
