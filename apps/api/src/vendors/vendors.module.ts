import { Module } from '@nestjs/common';
import { StatesModule } from '../states/states.module';
import { VendorDetailsController } from './vendor-details.controller';
import { VendorDetailsService } from './vendor-details.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [StatesModule],
  controllers: [VendorsController, VendorDetailsController],
  providers: [VendorsService, VendorDetailsService],
  exports: [VendorsService],
})
export class VendorsModule {}
