import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  CreateVendorBankAccountRequest,
  CreateVendorContactRequest,
  CreateVendorGstRegistrationRequest,
  UpdateVendorBankAccountRequest,
  UpdateVendorContactRequest,
  UpdateVendorGstRegistrationRequest,
  type VendorBankAccountResponse,
  type VendorContactResponse,
  type VendorGstRegistrationResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VendorDetailsService } from './vendor-details.service';

const MANAGE = 'masters.vendors.manage';

/** GST registrations, bank accounts and contacts of a vendor. */
@Controller()
export class VendorDetailsController {
  constructor(private readonly details: VendorDetailsService) {}

  // ---------- GST registrations ----------

  @Post('vendors/:id/gst-registrations')
  @RequirePermissions(MANAGE)
  createGst(
    @Param('id', new ParseUUIDPipe()) vendorId: string,
    @Body(new ZodValidationPipe(CreateVendorGstRegistrationRequest))
    body: CreateVendorGstRegistrationRequest,
    @Req() request: Request,
  ): Promise<VendorGstRegistrationResponse> {
    return this.details.createGst(vendorId, body, actorIdOf(request), accessOf(request));
  }

  @Patch('vendor-gst-registrations/:id')
  @RequirePermissions(MANAGE)
  updateGst(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateVendorGstRegistrationRequest))
    body: UpdateVendorGstRegistrationRequest,
    @Req() request: Request,
  ): Promise<VendorGstRegistrationResponse> {
    return this.details.updateGst(id, body, actorIdOf(request), accessOf(request));
  }

  @Post('vendor-gst-registrations/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deactivateGst(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorGstRegistrationResponse> {
    return this.details.setGstActive(id, false, actorIdOf(request), accessOf(request));
  }

  @Post('vendor-gst-registrations/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  reactivateGst(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorGstRegistrationResponse> {
    return this.details.setGstActive(id, true, actorIdOf(request), accessOf(request));
  }

  // ---------- Bank accounts ----------

  @Post('vendors/:id/bank-accounts')
  @RequirePermissions(MANAGE)
  createBank(
    @Param('id', new ParseUUIDPipe()) vendorId: string,
    @Body(new ZodValidationPipe(CreateVendorBankAccountRequest))
    body: CreateVendorBankAccountRequest,
    @Req() request: Request,
  ): Promise<VendorBankAccountResponse> {
    return this.details.createBank(vendorId, body, actorIdOf(request), accessOf(request));
  }

  @Patch('vendor-bank-accounts/:id')
  @RequirePermissions(MANAGE)
  updateBank(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateVendorBankAccountRequest))
    body: UpdateVendorBankAccountRequest,
    @Req() request: Request,
  ): Promise<VendorBankAccountResponse> {
    return this.details.updateBank(id, body, actorIdOf(request), accessOf(request));
  }

  @Post('vendor-bank-accounts/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deactivateBank(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorBankAccountResponse> {
    return this.details.setBankActive(id, false, actorIdOf(request), accessOf(request));
  }

  @Post('vendor-bank-accounts/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  reactivateBank(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorBankAccountResponse> {
    return this.details.setBankActive(id, true, actorIdOf(request), accessOf(request));
  }

  // ---------- Contacts ----------

  @Post('vendors/:id/contacts')
  @RequirePermissions(MANAGE)
  createContact(
    @Param('id', new ParseUUIDPipe()) vendorId: string,
    @Body(new ZodValidationPipe(CreateVendorContactRequest)) body: CreateVendorContactRequest,
    @Req() request: Request,
  ): Promise<VendorContactResponse> {
    return this.details.createContact(vendorId, body, actorIdOf(request), accessOf(request));
  }

  @Patch('vendor-contacts/:id')
  @RequirePermissions(MANAGE)
  updateContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateVendorContactRequest)) body: UpdateVendorContactRequest,
    @Req() request: Request,
  ): Promise<VendorContactResponse> {
    return this.details.updateContact(id, body, actorIdOf(request), accessOf(request));
  }

  @Post('vendor-contacts/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deactivateContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorContactResponse> {
    return this.details.setContactActive(id, false, actorIdOf(request), accessOf(request));
  }

  @Post('vendor-contacts/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  reactivateContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<VendorContactResponse> {
    return this.details.setContactActive(id, true, actorIdOf(request), accessOf(request));
  }
}
