import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateRoleRequest,
  UpdateRoleRequest,
  type RoleListResponse,
  type RoleResponse,
} from '@uie/contracts';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('administration.rolesAndPermissions.view')
  list(): Promise<RoleListResponse> {
    return this.roles.list();
  }

  @Get(':id')
  @RequirePermissions('administration.rolesAndPermissions.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<RoleResponse> {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermissions('administration.rolesAndPermissions.manage')
  create(
    @Body(new ZodValidationPipe(CreateRoleRequest)) body: CreateRoleRequest,
  ): Promise<RoleResponse> {
    return this.roles.create(body);
  }

  @Patch(':id')
  @RequirePermissions('administration.rolesAndPermissions.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateRoleRequest)) body: UpdateRoleRequest,
  ): Promise<RoleResponse> {
    return this.roles.update(id, body);
  }
}
