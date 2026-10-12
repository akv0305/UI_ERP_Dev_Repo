import { Module } from '@nestjs/common';
import { StatesModule } from '../states/states.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { StoresService } from './stores.service';

@Module({
  imports: [StatesModule],
  controllers: [SitesController],
  providers: [SitesService, StoresService],
})
export class SitesModule {}
