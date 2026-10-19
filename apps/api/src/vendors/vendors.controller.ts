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
  ApproveVendorRequest,
  CreateVendorRequest,
  RejectVendorRequest,
  ReopenVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  type PagedVendorsResponse,
  type VendorDetailResponse,
  type VendorResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequirePermissions('masters.vendors.view')
  list(
    @Query(new ZodValidationPipe(VendorListQuery)) query: VendorListQuery,
    @Req() request: Request,
  ): Promise<PagedVendorsResponse> {
    return this.vendors.list(query, actorIdOf(request), accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('masters.vendors.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorDetailResponse> {
    return this.vendors.get(id, actorIdOf(request), accessOf(request));
  }

  @Post()
  @RequirePermissions('masters.vendors.manage')
  create(
    @Body(new ZodValidationPipe(CreateVendorRequest)) body: CreateVendorRequest,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('masters.vendors.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateVendorRequest)) body: UpdateVendorRequest,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.vendors.manage')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.submit(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.vendors.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ApproveVendorRequest)) body: ApproveVendorRequest,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.approve(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.vendors.approve')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RejectVendorRequest)) body: RejectVendorRequest,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.reject(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.vendors.approve')
  reopen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReopenVendorRequest)) body: ReopenVendorRequest,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.reopen(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.vendors.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.deactivate(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.vendors.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorResponse> {
    return this.vendors.reactivate(id, actorIdOf(request), accessOf(request));
  }
}
