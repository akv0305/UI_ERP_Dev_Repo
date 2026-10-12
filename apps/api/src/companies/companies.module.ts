import { Module } from '@nestjs/common';
import { StatesModule } from '../states/states.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { GstRegistrationsService } from './gst-registrations.service';

@Module({
  imports: [StatesModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, GstRegistrationsService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
