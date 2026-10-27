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
  CancelEnquiryRequest,
  CreateEnquiryRequest,
  EnquiryIndentLineOptionsQuery,
  EnquiryListQuery,
  EnquiryPrintQuery,
  EnquiryVendorOptionsQuery,
  UpdateEnquiryRequest,
  type EnquiryDetailResponse,
  type EnquiryFormOptionsResponse,
  type EnquiryIndentLineOptionsResponse,
  EnquiryPrintResponse,
  type EnquiryResponse,
  type EnquiryVendorOptionsResponse,
  type PagedEnquiriesResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EnquiriesService } from './enquiries.service';

@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get()
  @RequirePermissions('purchase.enquiries.view')
  list(
    @Query(new ZodValidationPipe(EnquiryListQuery)) query: EnquiryListQuery,
    @Req() request: Request,
  ): Promise<PagedEnquiriesResponse> {
    return this.enquiries.list(query, accessOf(request));
  }

  // Static routes before ':id'.
  @Get('form-options')
  @RequirePermissions('purchase.enquiries.manage')
  formOptions(@Req() request: Request): Promise<EnquiryFormOptionsResponse> {
    return this.enquiries.formOptions(accessOf(request));
  }

  @Get('indent-line-options')
  @RequirePermissions('purchase.enquiries.manage')
  indentLineOptions(
    @Query(new ZodValidationPipe(EnquiryIndentLineOptionsQuery))
    query: EnquiryIndentLineOptionsQuery,
    @Req() request: Request,
  ): Promise<EnquiryIndentLineOptionsResponse> {
    return this.enquiries.indentLineOptions(query, accessOf(request));
  }

  @Get('vendor-options')
  @RequirePermissions('purchase.enquiries.manage')
  vendorOptions(
    @Query(new ZodValidationPipe(EnquiryVendorOptionsQuery)) query: EnquiryVendorOptionsQuery,
  ): Promise<EnquiryVendorOptionsResponse> {
    return this.enquiries.vendorOptions(query);
  }

  @Get(':id')
  @RequirePermissions('purchase.enquiries.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<EnquiryDetailResponse> {
    return this.enquiries.get(id, accessOf(request));
  }

  @Get(':id/print')
  @RequirePermissions('purchase.enquiries.view')
  print(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(EnquiryPrintQuery)) query: EnquiryPrintQuery,
    @Req() request: Request,
  ): Promise<EnquiryPrintResponse> {
    return this.enquiries.print(id, query.vendorId, accessOf(request));
  }

  @Post()
  @RequirePermissions('purchase.enquiries.manage')
  create(
    @Body(new ZodValidationPipe(CreateEnquiryRequest)) body: CreateEnquiryRequest,
    @Req() request: Request,
  ): Promise<EnquiryResponse> {
    return this.enquiries.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('purchase.enquiries.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateEnquiryRequest)) body: UpdateEnquiryRequest,
    @Req() request: Request,
  ): Promise<EnquiryResponse> {
    return this.enquiries.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.enquiries.manage')
  send(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<EnquiryResponse> {
    return this.enquiries.send(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.enquiries.manage')
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<EnquiryResponse> {
    return this.enquiries.close(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.enquiries.manage')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelEnquiryRequest)) body: CancelEnquiryRequest,
    @Req() request: Request,
  ): Promise<EnquiryResponse> {
    return this.enquiries.cancel(id, body, actorIdOf(request), accessOf(request));
  }
}
