import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@uie/contracts';
import type { Request } from 'express';
import { ApiError } from '../common/errors/api-error';
import { REQUIRED_PERMISSIONS_KEY } from './auth.decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (required === undefined || required.length === 0) {
      return true;
    }

    const auth = context.switchToHttp().getRequest<Request>().auth;

    if (auth === undefined || !required.every((code) => auth.permissions.has(code))) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have permission');
    }

    return true;
  }
}
