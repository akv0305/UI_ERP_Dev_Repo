import { z } from 'zod';
import { ALL_PERMISSIONS } from './permissions';

export const AUTH_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PASSWORD_CHANGE_REQUIRED',
  'INVALID_CURRENT_PASSWORD',
  'VALIDATION_ERROR',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const SESSION_COOKIE_NAME = 'uie_session';

export const PermissionCode = z.enum(ALL_PERMISSIONS);

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PasswordPolicy = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .regex(/[A-Za-z]/)
  .regex(/\d/);

export const LoginRequest = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type LoginRequest = z.infer<typeof LoginRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: PasswordPolicy,
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const MeRole = z.object({
  code: z.string(),
  name: z.string(),
});

export type MeRole = z.infer<typeof MeRole>;

export const MeResponse = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string().nullable(),
  displayName: z.string(),
  mustChangePassword: z.boolean(),
  roles: z.array(MeRole),
  permissions: z.array(PermissionCode),
});

export type MeResponse = z.infer<typeof MeResponse>;
