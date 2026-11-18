import { Module } from '@nestjs/common';
import { DesignationsController } from './designations.controller';
import { DesignationsService } from './designations.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [DesignationsController, EmployeesController],
  providers: [DesignationsService, EmployeesService],
  exports: [DesignationsService, EmployeesService],
})
export class HrModule {}
