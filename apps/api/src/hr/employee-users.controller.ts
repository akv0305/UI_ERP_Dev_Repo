import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  CreateEmployeeUserRequest,
  LinkEmployeeUserRequest,
  type EmployeeResponse,
  type LinkableUsersResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EmployeeUsersService } from './employee-users.service';

/** Sign-in user of an employee; hr.employees.manage on the employee's company (OQ-148 a). */
@Controller('employees')
export class EmployeeUsersController {
  constructor(private readonly employeeUsers: EmployeeUsersService) {}

  @Get(':id/linkable-users')
  @RequirePermissions('hr.employees.manage')
  linkableUsers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<LinkableUsersResponse> {
    return this.employeeUsers.linkableUsers(id, accessOf(request));
  }

  @Post(':id/create-user')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr.employees.manage')
  createUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateEmployeeUserRequest)) body: CreateEmployeeUserRequest,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employeeUsers.createUser(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/link-user')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr.employees.manage')
  linkUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(LinkEmployeeUserRequest)) body: LinkEmployeeUserRequest,
    @Req() request: Request,
  ): Promise<EmployeeResponse> {
    return this.employeeUsers.linkUser(id, body, actorIdOf(request), accessOf(request));
  }
}
