import { z } from 'zod';
import { PasswordPolicy, PermissionCode } from './auth';

export const ADMIN_ERROR_CODES = [
  'LAST_ADMINISTRATOR',
  'SYSTEM_ROLE_PROTECTED',
  'CANNOT_DEACTIVATE_SELF',
  'DUPLICATE_USERNAME',
  'DUPLICATE_EMAIL',
  'DUPLICATE_ROLE_CODE',
  'NOT_FOUND',
  'INVALID_ROLE',
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

const emptyToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim().length === 0 ? null : value;

// ---------- Users ----------

export const UserEmail = z.preprocess(emptyToNull, z.email().max(254).nullable());

export const UserFields = z.object({
  username: z.string().trim().min(1).max(64),
  email: UserEmail,
  displayName: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
  roleIds: z.array(z.uuid()),
});

export const CreateUserRequest = UserFields.extend({
  temporaryPassword: PasswordPolicy,
});

export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const UpdateUserRequest = UserFields;

export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export const ResetPasswordRequest = z.object({
  newPassword: PasswordPolicy,
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

export const UserRoleSummary = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

export type UserRoleSummary = z.infer<typeof UserRoleSummary>;

export const UserResponse = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string().nullable(),
  displayName: z.string(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  failedLoginCount: z.number().int(),
  lockedUntil: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  roles: z.array(UserRoleSummary),
});

export type UserResponse = z.infer<typeof UserResponse>;

export const UserListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  active: z.enum(['true', 'false']).optional(),
  sortBy: z
    .enum(['username', 'displayName', 'email', 'lastLoginAt', 'createdAt'])
    .default('username'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type UserListQuery = z.infer<typeof UserListQuery>;

export const PagedUsersResponse = z.object({
  items: z.array(UserResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedUsersResponse = z.infer<typeof PagedUsersResponse>;

// ---------- Roles ----------

export const RoleFields = z.object({
  code: z.string().trim().min(1).max(64).regex(ROLE_CODE_PATTERN),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
  permissionCodes: z.array(PermissionCode),
});

export const CreateRoleRequest = RoleFields;

export type CreateRoleRequest = z.infer<typeof CreateRoleRequest>;

export const UpdateRoleRequest = RoleFields;

export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequest>;

export const RoleResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  permissionCodes: z.array(PermissionCode),
  userCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RoleResponse = z.infer<typeof RoleResponse>;

export const RoleListResponse = z.object({
  items: z.array(RoleResponse),
});

export type RoleListResponse = z.infer<typeof RoleListResponse>;

export const RoleOption = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

export type RoleOption = z.infer<typeof RoleOption>;

export const RoleOptionsResponse = z.object({
  items: z.array(RoleOption),
});

export type RoleOptionsResponse = z.infer<typeof RoleOptionsResponse>;
