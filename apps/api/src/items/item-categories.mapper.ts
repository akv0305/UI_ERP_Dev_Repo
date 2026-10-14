import type { ItemCategory } from '@prisma/client';
import type { ItemCategoryResponse } from '@uie/contracts';

export function toItemCategoryResponse(
  category: ItemCategory,
  canManage: boolean,
): ItemCategoryResponse {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    canManage,
  };
}

export function toItemCategoryAuditSnapshot(category: ItemCategory): Record<string, unknown> {
  return {
    code: category.code,
    name: category.name,
    isActive: category.isActive,
  };
}
