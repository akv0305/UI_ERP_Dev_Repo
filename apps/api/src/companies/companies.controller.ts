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
  CompanyListQuery,
  CreateCompanyRequest,
  CreateGstRegistrationRequest,
  UpdateCompanyRequest,
  UpdateGstRegistrationRequest,
  type CompanyDetailResponse,
  type CompanyResponse,
  type GstRegistrationResponse,
  type PagedCompaniesResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CompaniesService } from './companies.service';
import { GstRegistrationsService } from './gst-registrations.service';

@Controller()
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly registrations: GstRegistrationsService,
  ) {}

  @Get('companies')
  @RequirePermissions('masters.companies.view')
  list(
    @Query(new ZodValidationPipe(CompanyListQuery)) query: CompanyListQuery,
  ): Promise<PagedCompaniesResponse> {
    return this.companies.list(query);
  }

  @Get('companies/:id')
  @RequirePermissions('masters.companies.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<CompanyDetailResponse> {
    return this.companies.get(id);
  }

  @Post('companies')
  @RequirePermissions('masters.companies.manage')
  create(
    @Body(new ZodValidationPipe(CreateCompanyRequest)) body: CreateCompanyRequest,
    @Req() request: Request,
  ): Promise<CompanyResponse> {
    return this.companies.create(body, actorIdOf(request));
  }

  @Patch('companies/:id')
  @RequirePermissions('masters.companies.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCompanyRequest)) body: UpdateCompanyRequest,
    @Req() request: Request,
  ): Promise<CompanyResponse> {
    return this.companies.update(id, body, actorIdOf(request));
  }

  @Post('companies/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.companies.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<CompanyResponse> {
    return this.companies.deactivate(id, actorIdOf(request));
  }

  @Post('companies/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.companies.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<CompanyResponse> {
    return this.companies.reactivate(id, actorIdOf(request));
  }

  @Post('companies/:id/gst-registrations')
  @RequirePermissions('masters.companies.manage')
  createRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateGstRegistrationRequest)) body: CreateGstRegistrationRequest,
    @Req() request: Request,
  ): Promise<GstRegistrationResponse> {
    return this.registrations.create(id, body, actorIdOf(request));
  }

  @Patch('gst-registrations/:id')
  @RequirePermissions('masters.companies.manage')
  updateRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateGstRegistrationRequest)) body: UpdateGstRegistrationRequest,
    @Req() request: Request,
  ): Promise<GstRegistrationResponse> {
    return this.registrations.update(id, body, actorIdOf(request));
  }

  @Post('gst-registrations/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.companies.manage')
  deactivateRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<GstRegistrationResponse> {
    return this.registrations.deactivate(id, actorIdOf(request));
  }

  @Post('gst-registrations/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.companies.manage')
  reactivateRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<GstRegistrationResponse> {
    return this.registrations.reactivate(id, actorIdOf(request));
  }
}
