import type { Prisma } from '@prisma/client';
import type { ItemResponse } from '@uie/contracts';
import { codeLabel } from '../auth/auth.mapper';
import type { ItemFlags } from './item-access';

const actorSelect = { select: { id: true, displayName: true } } as const;

export const itemInclude = {
  category: true,
  unit: true,
  submittedBy: actorSelect,
  decidedBy: actorSelect,
} satisfies Prisma.ItemInclude;

export type ItemWithRelations = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

/** GST % always as a 2-decimal string ("18.00"); never passes through a float. */
export function gstRateText(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

export function toItemResponse(item: ItemWithRelations, flags: ItemFlags): ItemResponse {
  return {
    id: item.id,
    code: item.code,
    description: item.description,
    size: item.size,
    category: {
      id: item.category.id,
      code: item.category.code,
      name: item.category.name,
      isActive: item.category.isActive,
    },
    unit: {
      id: item.unit.id,
      code: item.unit.code,
      name: item.unit.name,
      decimalPlaces: item.unit.decimalPlaces,
      isActive: item.unit.isActive,
    },
    itemUse: item.itemUse,
    hsnCode: item.hsnCode,
    gstRate: gstRateText(item.gstRate),
    remarks: item.remarks,
    status: item.status,
    submittedAt: item.submittedAt?.toISOString() ?? null,
    submittedBy: item.submittedBy,
    decidedAt: item.decidedAt?.toISOString() ?? null,
    decidedBy: item.decidedBy,
    decisionRemarks: item.decisionRemarks,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    ...flags,
  };
}

/** Readable values for the Audit Log (category as "IG-0002 Cement", unit by code). */
export function toItemAuditSnapshot(item: ItemWithRelations): Record<string, unknown> {
  return {
    code: item.code,
    description: item.description,
    size: item.size,
    category: codeLabel(item.category.code, item.category.name),
    unit: item.unit.code,
    itemUse: item.itemUse,
    hsnCode: item.hsnCode,
    gstRate: gstRateText(item.gstRate),
    remarks: item.remarks,
    status: item.status,
    decisionRemarks: item.decisionRemarks,
    isActive: item.isActive,
  };
}
