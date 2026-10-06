import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE_NAME } from '@uie/contracts';
import type { Request } from 'express';
import { ApiError } from '../common/errors/api-error';
import { ALLOW_PASSWORD_CHANGE_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const auth = await this.authService.resolveSession(cookies?.[SESSION_COOKIE_NAME]);

    if (auth === null) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Authentication required');
    }

    request.auth = auth;

    const allowedDuringChange =
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PASSWORD_CHANGE_KEY, targets) ===
      true;

    if (auth.user.mustChangePassword && !allowedDuringChange) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'PASSWORD_CHANGE_REQUIRED',
        'Password change required before using the application',
      );
    }

    return true;
  }
}
