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
  CreateEmployeeRequest,
  EmployeeListQuery,
  UpdateEmployeeRequest,
  type EmployeeFormOptionsResponse,
  type EmployeeResponse,
  type PagedEmployeesResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('hr.employees.view')
  list(
    @Query(new ZodValidationPipe(EmployeeListQuery)) query: EmployeeListQuery,
    @Req() request: Request,
  ): Promise<PagedEmployeesResponse> {
    return this.employees.list(query, accessOf(request));
  }

  /** Declared before ':id' so "form-options" is not parsed as an id. */
  @Get('form-options')
  @RequirePermissions('hr.employees.manage')
  formOptions(@Req() request: Request): Promise<EmployeeFormOptionsResponse> {
    return this.employees.formOptions(accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('hr.employees.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employees.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('hr.employees.manage')
  create(
    @Body(new ZodValidationPipe(CreateEmployeeRequest)) body: CreateEmployeeRequest,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employees.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('hr.employees.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeRequest)) body: UpdateEmployeeRequest,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employees.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr.employees.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employees.deactivate(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr.employees.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employees.reactivate(id, actorIdOf(request), accessOf(request));
  }
}
