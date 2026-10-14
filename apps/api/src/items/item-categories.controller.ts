import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  CreateItemCategoryRequest,
  ItemCategoryListQuery,
  UpdateItemCategoryRequest,
  type ItemCategoryOptionsResponse,
  type ItemCategoryResponse,
  type PagedItemCategoriesResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ItemCategoriesService } from './item-categories.service';

@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly categories: ItemCategoriesService) {}

  @Get()
  @RequirePermissions('masters.items.view')
  list(
    @Query(new ZodValidationPipe(ItemCategoryListQuery)) query: ItemCategoryListQuery,
    @Req() request: Request,
  ): Promise<PagedItemCategoriesResponse> {
    return this.categories.list(query, accessOf(request));
  }

  /** Pick list for the item form; declared before ':id' so "options" is not parsed as an id. */
  @Get('options')
  @RequirePermissions('masters.items.manage')
  options(@Req() request: Request): Promise<ItemCategoryOptionsResponse> {
    return this.categories.options(accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('masters.items.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemCategoryResponse> {
    return this.categories.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('masters.items.manage')
  create(
    @Body(new ZodValidationPipe(CreateItemCategoryRequest)) body: CreateItemCategoryRequest,
    @Req() request: Request,
  ): Promise<ItemCategoryResponse> {
    return this.categories.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('masters.items.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateItemCategoryRequest)) body: UpdateItemCategoryRequest,
    @Req() request: Request,
  ): Promise<ItemCategoryResponse> {
    return this.categories.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemCategoryResponse> {
    return this.categories.deactivate(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemCategoryResponse> {
    return this.categories.reactivate(id, actorIdOf(request), accessOf(request));
  }
}
