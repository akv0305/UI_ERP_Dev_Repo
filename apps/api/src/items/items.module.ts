import { Module } from '@nestjs/common';
import { ItemCategoriesController } from './item-categories.controller';
import { ItemCategoriesService } from './item-categories.service';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  controllers: [UnitsController, ItemCategoriesController, ItemsController],
  providers: [UnitsService, ItemCategoriesService, ItemsService],
  exports: [UnitsService, ItemCategoriesService, ItemsService],
})
export class ItemsModule {}
