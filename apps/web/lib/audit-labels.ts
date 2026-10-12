import { terminology } from '@/config/terminology';

export function entityTypeLabel(entityType: string): string {
  const labels = terminology.auditLog.entityTypes as Record<string, string>;

  return labels[entityType] ?? entityType;
}
