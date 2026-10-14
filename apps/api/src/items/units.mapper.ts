import type { Unit } from '@prisma/client';
import type { UnitResponse } from '@uie/contracts';

export function toUnitResponse(unit: Unit, canManage: boolean): UnitResponse {
  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    decimalPlaces: unit.decimalPlaces,
    isActive: unit.isActive,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
    canManage,
  };
}

export function toUnitAuditSnapshot(unit: Unit): Record<string, unknown> {
  return {
    code: unit.code,
    name: unit.name,
    decimalPlaces: unit.decimalPlaces,
    isActive: unit.isActive,
  };
}
