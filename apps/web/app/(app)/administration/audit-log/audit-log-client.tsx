'use client';

import type { SortingState } from '@tanstack/react-table';
import {
  AUDIT_ENTITY_TYPES,
  type AuditEventListQuery,
  type AuditEventSummary,
  type PagedAuditEventsResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FilterBarValue,
  type FilterField,
} from '@/components/erp';
import { terminology } from '@/config/terminology';
import { entityTypeLabel } from '@/lib/audit-labels';
import { formatDateTime } from '@/lib/format';

const ALL_VALUE = 'all';

export interface ActorOption {
  id: string;
  label: string;
}

export interface AuditLogClientProps {
  data: PagedAuditEventsResponse;
  query: AuditEventListQuery;
  actors: ActorOption[];
}

const columns: DataTableColumn<AuditEventSummary>[] = [
  {
    id: 'occurredAt',
    header: terminology.auditLog.columnWhen,
    enableSorting: false,
    cell: ({ row }) => formatDateTime(row.original.occurredAt),
  },
  {
    id: 'user',
    header: terminology.auditLog.columnUser,
    enableSorting: false,
    cell: ({ row }) => row.original.actor?.displayName ?? terminology.auditLog.system,
  },
  {
    id: 'action',
    header: terminology.auditLog.columnAction,
    enableSorting: false,
    cell: ({ row }) => terminology.auditLog.actions[row.original.action],
  },
  {
    id: 'entityType',
    header: terminology.auditLog.columnEntityType,
    enableSorting: false,
    cell: ({ row }) => entityTypeLabel(row.original.entityType),
  },
  {
    id: 'entity',
    header: terminology.auditLog.columnEntity,
    enableSorting: false,
    cell: ({ row }) => row.original.entityLabel,
  },
];

export function AuditLogClient({ data, query, actors }: AuditLogClientProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterBarValue>({
    entityType: query.entityType ?? ALL_VALUE,
    actorUserId: query.actorUserId ?? ALL_VALUE,
    datesFrom: query.fromDate ?? '',
    datesTo: query.toDate ?? '',
  });

  const filterFields: FilterField[] = [
    {
      key: 'entityType',
      label: terminology.auditLog.filterEntityType,
      type: 'select',
      options: [
        { value: ALL_VALUE, label: terminology.filters.all },
        ...AUDIT_ENTITY_TYPES.map((value) => ({ value, label: entityTypeLabel(value) })),
      ],
    },
    ...(actors.length === 0
      ? []
      : [
          {
            key: 'actorUserId',
            label: terminology.auditLog.filterUser,
            type: 'select' as const,
            options: [
              { value: ALL_VALUE, label: terminology.filters.all },
              ...actors.map((actor) => ({ value: actor.id, label: actor.label })),
            ],
          },
        ]),
    { key: 'dates', label: terminology.auditLog.filterDates, type: 'dateRange' },
  ];

  function navigate(next: Partial<AuditEventListQuery>, values: FilterBarValue = filters): void {
    const merged = { ...query, ...next };
    const params = new URLSearchParams({
      page: String(merged.page),
      pageSize: String(merged.pageSize),
    });
    const entityType = values.entityType ?? ALL_VALUE;
    const actorUserId = values.actorUserId ?? ALL_VALUE;

    if (entityType !== ALL_VALUE && entityType.length > 0) {
      params.set('entityType', entityType);
    }

    if (actorUserId !== ALL_VALUE && actorUserId.length > 0) {
      params.set('actorUserId', actorUserId);
    }

    if ((values.datesFrom ?? '').length > 0) {
      params.set('fromDate', values.datesFrom ?? '');
    }

    if ((values.datesTo ?? '').length > 0) {
      params.set('toDate', values.datesTo ?? '');
    }

    // An entity filter set from a link stays until the user resets the filters.
    if (merged.entityId !== undefined) {
      params.set('entityId', merged.entityId);
    }

    router.push(`/administration/audit-log?${params.toString()}`);
  }

  function handleFilterChange(next: FilterBarValue): void {
    setFilters(next);
    navigate({ page: 1 }, next);
  }

  function handleReset(): void {
    const cleared = { entityType: ALL_VALUE, actorUserId: ALL_VALUE, datesFrom: '', datesTo: '' };

    setFilters(cleared);
    navigate({ page: 1, entityId: undefined }, cleared);
  }

  const sorting: SortingState = [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.nav.auditLog} subtitle={terminology.auditLog.subtitle} />
      <FilterBar
        fields={filterFields}
        value={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
      />
      <DataTable
        columns={columns}
        data={data.items}
        totalRows={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sorting={sorting}
        onPageChange={(page) => navigate({ page })}
        onPageSizeChange={(pageSize) => navigate({ pageSize, page: 1 })}
        onSortingChange={() => undefined}
        onRowClick={(event) => router.push(`/administration/audit-log/${event.id}`)}
      />
    </div>
  );
}
