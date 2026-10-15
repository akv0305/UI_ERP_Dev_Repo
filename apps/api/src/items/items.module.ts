import { Module } from '@nestjs/common';
import { ItemImportController } from './import/item-import.controller';
import { ItemImportService } from './import/item-import.service';
import { ItemCategoriesController } from './item-categories.controller';
import { ItemCategoriesService } from './item-categories.service';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  // ItemImportController first, so /items/import/... is never read as /items/:id/...
  controllers: [ItemImportController, UnitsController, ItemCategoriesController, ItemsController],
  providers: [UnitsService, ItemCategoriesService, ItemsService, ItemImportService],
  exports: [UnitsService, ItemCategoriesService, ItemsService, ItemImportService],
})
export class ItemsModule {}
