import type { Designation } from '@prisma/client';
import type { DesignationResponse } from '@uie/contracts';

export function toDesignationResponse(
  designation: Designation,
  canManage: boolean,
): DesignationResponse {
  return {
    id: designation.id,
    code: designation.code,
    name: designation.name,
    isActive: designation.isActive,
    createdAt: designation.createdAt.toISOString(),
    updatedAt: designation.updatedAt.toISOString(),
    canManage,
  };
}

export function toDesignationAuditSnapshot(designation: Designation): Record<string, unknown> {
  return {
    code: designation.code,
    name: designation.name,
    isActive: designation.isActive,
  };
}
