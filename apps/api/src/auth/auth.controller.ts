import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChangePasswordRequest,
  LoginRequest,
  SESSION_COOKIE_NAME,
  type MeResponse,
} from '@uie/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AllowDuringPasswordChange, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const result = await this.authService.login(body, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    response.cookie(SESSION_COOKIE_NAME, result.token, this.cookieOptions());

    return result.me;
  }

  @AllowDuringPasswordChange()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.requireAuth(request).sessionId);
    response.clearCookie(SESSION_COOKIE_NAME, { ...this.cookieOptions(), maxAge: undefined });
  }

  @AllowDuringPasswordChange()
  @Get('me')
  me(@Req() request: Request): MeResponse {
    return this.requireAuth(request).user;
  }

  @AllowDuringPasswordChange()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(ChangePasswordRequest))
  changePassword(
    @Body() body: ChangePasswordRequest,
    @Req() request: Request,
  ): Promise<MeResponse> {
    return this.authService.changePassword(this.requireAuth(request), body);
  }

  private requireAuth(request: Request): AuthContext {
    if (request.auth === undefined) {
      throw new Error('AuthGuard did not attach the session');
    }

    return request.auth;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      maxAge: this.authService.sessionTtlHours * 3_600_000,
    };
  }
}
