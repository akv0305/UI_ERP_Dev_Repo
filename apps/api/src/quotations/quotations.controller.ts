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
  CancelQuotationRequest,
  CreateQuotationRequest,
  QuotationEnquiryOptionsQuery,
  QuotationListQuery,
  UpdateQuotationRequest,
  type PagedQuotationsResponse,
  type QuotationDetailResponse,
  type QuotationEnquiryFormResponse,
  type QuotationEnquiryOptionsResponse,
  type QuotationResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  @RequirePermissions('purchase.quotations.view')
  list(
    @Query(new ZodValidationPipe(QuotationListQuery)) query: QuotationListQuery,
    @Req() request: Request,
  ): Promise<PagedQuotationsResponse> {
    return this.quotations.list(query, accessOf(request));
  }

  // Static routes before ':id'.
  @Get('enquiry-options')
  @RequirePermissions('purchase.quotations.manage')
  enquiryOptions(
    @Query(new ZodValidationPipe(QuotationEnquiryOptionsQuery)) query: QuotationEnquiryOptionsQuery,
    @Req() request: Request,
  ): Promise<QuotationEnquiryOptionsResponse> {
    return this.quotations.enquiryOptions(query, accessOf(request));
  }

  @Get('enquiries/:enquiryId/form')
  @RequirePermissions('purchase.quotations.manage')
  enquiryForm(
    @Param('enquiryId', new ParseUUIDPipe()) enquiryId: string,
    @Req() request: Request,
  ): Promise<QuotationEnquiryFormResponse> {
    return this.quotations.enquiryForm(enquiryId, accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('purchase.quotations.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<QuotationDetailResponse> {
    return this.quotations.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('purchase.quotations.manage')
  create(
    @Body(new ZodValidationPipe(CreateQuotationRequest)) body: CreateQuotationRequest,
    @Req() request: Request,
  ): Promise<QuotationResponse> {
    return this.quotations.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('purchase.quotations.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateQuotationRequest)) body: UpdateQuotationRequest,
    @Req() request: Request,
  ): Promise<QuotationResponse> {
    return this.quotations.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.quotations.manage')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<QuotationResponse> {
    return this.quotations.submit(id, actorIdOf(request), accessOf(request));
  }

  /** Returns the new Draft revision. */
  @Post(':id/revise')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.quotations.manage')
  revise(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<QuotationResponse> {
    return this.quotations.revise(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.quotations.manage')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelQuotationRequest)) body: CancelQuotationRequest,
    @Req() request: Request,
  ): Promise<QuotationResponse> {
    return this.quotations.cancel(id, body, actorIdOf(request), accessOf(request));
  }
}
