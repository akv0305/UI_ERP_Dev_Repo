import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PurchaseOrderApprovalsModule } from '../purchase-order-approvals/purchase-order-approvals.module';
import { DesignationsController } from './designations.controller';
import { DesignationsService } from './designations.service';
import { EmployeeUsersController } from './employee-users.controller';
import { EmployeeUsersService } from './employee-users.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuthModule, PurchaseOrderApprovalsModule],
  controllers: [DesignationsController, EmployeesController, EmployeeUsersController],
  providers: [DesignationsService, EmployeesService, EmployeeUsersService],
  exports: [DesignationsService, EmployeesService],
})
export class HrModule {}
