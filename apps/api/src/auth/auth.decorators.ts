import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@uie/contracts';

export const IS_PUBLIC_KEY = 'uie:isPublic';
export const ALLOW_PASSWORD_CHANGE_KEY = 'uie:allowDuringPasswordChange';
export const REQUIRED_PERMISSIONS_KEY = 'uie:requiredPermissions';

/** Route needs no session (health, login). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Route stays reachable while the user still has to change their password. */
export const AllowDuringPasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

/** Route needs every listed permission. */
export const RequirePermissions = (...codes: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, codes);
