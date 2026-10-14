import { Module } from '@nestjs/common';
import { ItemCategoriesController } from './item-categories.controller';
import { ItemCategoriesService } from './item-categories.service';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  controllers: [UnitsController, ItemCategoriesController],
  providers: [UnitsService, ItemCategoriesService],
  exports: [UnitsService, ItemCategoriesService],
})
export class ItemsModule {}
