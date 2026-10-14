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
  ApproveItemRequest,
  CreateItemRequest,
  ItemListQuery,
  RejectItemRequest,
  ReopenItemRequest,
  UpdateItemRequest,
  type ItemResponse,
  type PagedItemsResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions('masters.items.view')
  list(
    @Query(new ZodValidationPipe(ItemListQuery)) query: ItemListQuery,
    @Req() request: Request,
  ): Promise<PagedItemsResponse> {
    return this.items.list(query, accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('masters.items.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('masters.items.manage')
  create(
    @Body(new ZodValidationPipe(CreateItemRequest)) body: CreateItemRequest,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('masters.items.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateItemRequest)) body: UpdateItemRequest,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.submit(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ApproveItemRequest)) body: ApproveItemRequest,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.approve(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.approve')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RejectItemRequest)) body: RejectItemRequest,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.reject(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.approve')
  reopen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReopenItemRequest)) body: ReopenItemRequest,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.reopen(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.deactivate(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ItemResponse> {
    return this.items.reactivate(id, actorIdOf(request), accessOf(request));
  }
}
