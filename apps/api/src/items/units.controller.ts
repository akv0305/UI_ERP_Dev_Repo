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
  CreateUnitRequest,
  UnitListQuery,
  UpdateUnitRequest,
  type ItemUnitOptionsResponse,
  type PagedUnitsResponse,
  type UnitResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UnitsService } from './units.service';

@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermissions('masters.items.view')
  list(
    @Query(new ZodValidationPipe(UnitListQuery)) query: UnitListQuery,
    @Req() request: Request,
  ): Promise<PagedUnitsResponse> {
    return this.units.list(query, accessOf(request));
  }

  /** Pick list for the item form; declared before ':id' so "options" is not parsed as an id. */
  @Get('options')
  @RequirePermissions('masters.items.manage')
  options(@Req() request: Request): Promise<ItemUnitOptionsResponse> {
    return this.units.options(accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('masters.items.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<UnitResponse> {
    return this.units.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('masters.items.manage')
  create(
    @Body(new ZodValidationPipe(CreateUnitRequest)) body: CreateUnitRequest,
    @Req() request: Request,
  ): Promise<UnitResponse> {
    return this.units.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('masters.items.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateUnitRequest)) body: UpdateUnitRequest,
    @Req() request: Request,
  ): Promise<UnitResponse> {
    return this.units.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<UnitResponse> {
    return this.units.deactivate(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<UnitResponse> {
    return this.units.reactivate(id, actorIdOf(request), accessOf(request));
  }
}
