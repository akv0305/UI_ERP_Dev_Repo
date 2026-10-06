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
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserListQuery,
  type PagedUsersResponse,
  type RoleOptionsResponse,
  type UserResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

function actorId(request: Request): string {
  if (request.auth === undefined) {
    throw new Error('AuthGuard did not attach the session');
  }

  return request.auth.user.id;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('administration.users.view')
  list(
    @Query(new ZodValidationPipe(UserListQuery)) query: UserListQuery,
  ): Promise<PagedUsersResponse> {
    return this.users.list(query);
  }

  /** Roles a user can be assigned (needs only users.manage, not the roles screens' permission). */
  @Get('role-options')
  @RequirePermissions('administration.users.manage')
  roleOptions(): Promise<RoleOptionsResponse> {
    return this.users.roleOptions();
  }

  @Get(':id')
  @RequirePermissions('administration.users.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserResponse> {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions('administration.users.manage')
  create(
    @Body(new ZodValidationPipe(CreateUserRequest)) body: CreateUserRequest,
    @Req() request: Request,
  ): Promise<UserResponse> {
    return this.users.create(body, actorId(request));
  }

  @Patch(':id')
  @RequirePermissions('administration.users.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateUserRequest)) body: UpdateUserRequest,
    @Req() request: Request,
  ): Promise<UserResponse> {
    return this.users.update(id, body, actorId(request));
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('administration.users.manage')
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResetPasswordRequest)) body: ResetPasswordRequest,
    @Req() request: Request,
  ): Promise<void> {
    return this.users.resetPassword(id, body, actorId(request));
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('administration.users.manage')
  unlock(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request): Promise<void> {
    return this.users.unlock(id, actorId(request));
  }
}
