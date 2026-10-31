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
  CancelPurchaseOrderRequest,
  CreatePurchaseOrderRequest,
  PurchaseOrderListQuery,
  UpdatePurchaseOrderRequest,
  type PagedPurchaseOrdersResponse,
  type PurchaseOrderDetailResponse,
  type PurchaseOrderResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions('purchase.purchaseOrders.view')
  list(
    @Query(new ZodValidationPipe(PurchaseOrderListQuery)) query: PurchaseOrderListQuery,
    @Req() request: Request,
  ): Promise<PagedPurchaseOrdersResponse> {
    return this.purchaseOrders.list(query, accessOf(request));
  }

  // Static routes (batch 2c option lists) go above ':id'.

  @Get(':id')
  @RequirePermissions('purchase.purchaseOrders.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<PurchaseOrderDetailResponse> {
    return this.purchaseOrders.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('purchase.purchaseOrders.manage')
  create(
    @Body(new ZodValidationPipe(CreatePurchaseOrderRequest)) body: CreatePurchaseOrderRequest,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('purchase.purchaseOrders.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePurchaseOrderRequest)) body: UpdatePurchaseOrderRequest,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.purchaseOrders.manage')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.submit(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.purchaseOrders.manage')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelPurchaseOrderRequest)) body: CancelPurchaseOrderRequest,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.cancel(id, body, actorIdOf(request), accessOf(request));
  }
}
