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
  CreateDesignationRequest,
  DesignationListQuery,
  UpdateDesignationRequest,
  type DesignationResponse,
  type PagedDesignationsResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DesignationsService } from './designations.service';

@Controller('designations')
export class DesignationsController {
  constructor(private readonly designations: DesignationsService) {}

  @Get()
  @RequirePermissions('hr.designations.view')
  list(
    @Query(new ZodValidationPipe(DesignationListQuery)) query: DesignationListQuery,
    @Req() request: Request,
  ): Promise<PagedDesignationsResponse> {
    return this.designations.list(query, accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('hr.designations.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<DesignationResponse> {
    return this.designations.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('hr.designations.manage')
  create(
    @Body(new ZodValidationPipe(CreateDesignationRequest)) body: CreateDesignationRequest,
    @Req() request: Request,
  ): Promise<DesignationResponse> {
    return this.designations.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('hr.designations.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateDesignationRequest)) body: UpdateDesignationRequest,
    @Req() request: Request,
  ): Promise<DesignationResponse> {
    return this.designations.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr.designations.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<DesignationResponse> {
    return this.designations.deactivate(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr.designations.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<DesignationResponse> {
    return this.designations.reactivate(id, actorIdOf(request), accessOf(request));
  }
}
