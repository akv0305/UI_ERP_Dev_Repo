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
  ApprovePurchaseOrderRequest,
  CancelPurchaseOrderRequest,
  CreatePurchaseOrderRequest,
  PurchaseOrderComparisonFormQuery,
  PurchaseOrderListQuery,
  PurchaseOrderSearchQuery,
  PurchaseOrderVendorDetailsQuery,
  RejectPurchaseOrderRequest,
  SubmitPurchaseOrderRequest,
  UpdatePurchaseOrderRequest,
  type ApprovalRouteResponse,
  type PagedPurchaseOrdersResponse,
  type PurchaseOrderComparisonFormResponse,
  type PurchaseOrderComparisonOptionsResponse,
  type PurchaseOrderDetailResponse,
  type PurchaseOrderFormOptionsResponse,
  type PurchaseOrderItemOptionsResponse,
  type PurchaseOrderResponse,
  type PurchaseOrderVendorDetails,
  type PurchaseOrderVendorOptionsResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PurchaseOrderOptionsService } from './purchase-order-options.service';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly options: PurchaseOrderOptionsService,
  ) {}

  @Get()
  @RequirePermissions('purchase.purchaseOrders.view')
  list(
    @Query(new ZodValidationPipe(PurchaseOrderListQuery)) query: PurchaseOrderListQuery,
    @Req() request: Request,
  ): Promise<PagedPurchaseOrdersResponse> {
    return this.purchaseOrders.list(query, accessOf(request));
  }

  // Static routes before ':id'.
  @Get('form-options')
  @RequirePermissions('purchase.purchaseOrders.manage')
  formOptions(@Req() request: Request): Promise<PurchaseOrderFormOptionsResponse> {
    return this.options.formOptions(accessOf(request));
  }

  @Get('comparison-options')
  @RequirePermissions('purchase.purchaseOrders.manage')
  comparisonOptions(
    @Query(new ZodValidationPipe(PurchaseOrderSearchQuery)) query: PurchaseOrderSearchQuery,
    @Req() request: Request,
  ): Promise<PurchaseOrderComparisonOptionsResponse> {
    return this.options.comparisonOptions(query, accessOf(request));
  }

  @Get('comparison-form')
  @RequirePermissions('purchase.purchaseOrders.manage')
  comparisonForm(
    @Query(new ZodValidationPipe(PurchaseOrderComparisonFormQuery))
    query: PurchaseOrderComparisonFormQuery,
    @Req() request: Request,
  ): Promise<PurchaseOrderComparisonFormResponse> {
    return this.options.comparisonForm(query, accessOf(request));
  }

  @Get('vendor-options')
  @RequirePermissions('purchase.purchaseOrders.manage')
  vendorOptions(
    @Query(new ZodValidationPipe(PurchaseOrderSearchQuery)) query: PurchaseOrderSearchQuery,
  ): Promise<PurchaseOrderVendorOptionsResponse> {
    return this.options.vendorOptions(query);
  }

  @Get('vendor-details')
  @RequirePermissions('purchase.purchaseOrders.manage')
  vendorDetails(
    @Query(new ZodValidationPipe(PurchaseOrderVendorDetailsQuery))
    query: PurchaseOrderVendorDetailsQuery,
    @Req() request: Request,
  ): Promise<PurchaseOrderVendorDetails> {
    return this.options.vendorDetails(query, accessOf(request));
  }

  @Get('item-options')
  @RequirePermissions('purchase.purchaseOrders.manage')
  itemOptions(
    @Query(new ZodValidationPipe(PurchaseOrderSearchQuery)) query: PurchaseOrderSearchQuery,
  ): Promise<PurchaseOrderItemOptionsResponse> {
    return this.options.itemOptions(query);
  }

  /** No route permission: the service allows view/manage on the site, or the PO's approvers (OQ-103). */
  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<PurchaseOrderDetailResponse> {
    return this.purchaseOrders.get(id, accessOf(request), actorIdOf(request));
  }

  @Get(':id/approval-route')
  approvalRoute(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ApprovalRouteResponse> {
    return this.purchaseOrders.approvalRoute(id, accessOf(request), actorIdOf(request));
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
    @Body(new ZodValidationPipe(SubmitPurchaseOrderRequest)) body: SubmitPurchaseOrderRequest,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.submit(id, body, actorIdOf(request), accessOf(request));
  }

  /** Authority comes from being the assigned approver, not a permission (OQ-92, OQ-103). */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ApprovePurchaseOrderRequest)) body: ApprovePurchaseOrderRequest,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.approve(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RejectPurchaseOrderRequest)) body: RejectPurchaseOrderRequest,
    @Req() request: Request,
  ): Promise<PurchaseOrderResponse> {
    return this.purchaseOrders.reject(id, body, actorIdOf(request), accessOf(request));
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
