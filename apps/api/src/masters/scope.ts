import { HttpStatus } from '@nestjs/common';
import type { Permission } from '@uie/contracts';
import type { AccessContext, ResolvedTarget } from '../access/access-context';
import { ApiError } from '../common/errors/api-error';
import { notFound } from './master-helpers';

/** The view and manage permissions of one master entity. */
export interface EntityPermissions {
  view: Permission;
  manage: Permission;
}

export const COMPANY_PERMISSIONS: EntityPermissions = {
  view: 'masters.companies.view',
  manage: 'masters.companies.manage',
};

export const PROJECT_PERMISSIONS: EntityPermissions = {
  view: 'masters.projects.view',
  manage: 'masters.projects.manage',
};

export const SITE_PERMISSIONS: EntityPermissions = {
  view: 'masters.sitesAndStores.view',
  manage: 'masters.sitesAndStores.manage',
};

export function forbidden(): ApiError {
  return new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have permission');
}

/** Ancestors of a record that are already loaded with it, so no lookup is needed. */
export type KnownTarget = Partial<ResolvedTarget>;

/** A record is visible when the user holds view OR manage over it (manage implies seeing it). */
export function canSee(
  access: AccessContext,
  permissions: EntityPermissions,
  target: KnownTarget,
): boolean {
  return access.canOn(permissions.view, target) || access.canOn(permissions.manage, target);
}

export function canManage(
  access: AccessContext,
  permissions: EntityPermissions,
  target: KnownTarget,
): boolean {
  return access.canOn(permissions.manage, target);
}

/** Out-of-scope records do not exist as far as the caller can tell: 404, never 403. */
export function assertVisible(
  access: AccessContext,
  permissions: EntityPermissions,
  target: KnownTarget,
  entity: string,
): void {
  if (!canSee(access, permissions, target)) {
    throw notFound(entity);
  }
}

/** 404 when the record is out of scope, 403 when it is visible but the user may not change it. */
export function assertManageable(
  access: AccessContext,
  permissions: EntityPermissions,
  target: KnownTarget,
  entity: string,
): void {
  assertVisible(access, permissions, target, entity);

  if (!canManage(access, permissions, target)) {
    throw forbidden();
  }
}

/** Prisma `id` filter for an accessible-id list (null = unrestricted = no filter). */
export function idFilter(ids: string[] | null): { in: string[] } | undefined {
  return ids === null ? undefined : { in: ids };
}
