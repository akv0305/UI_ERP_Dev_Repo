import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { PasswordService } from './password.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    LoginRateLimiter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
