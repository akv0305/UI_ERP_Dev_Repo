'use client';

import {
  ITEM_USES,
  type BulkApproveItemsResponse,
  type ItemListQuery,
  type ItemResponse,
  type PagedItemsResponse,
} from '@uie/contracts';
import { useMemo, useState } from 'react';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FieldOption,
  type FilterField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { ALL_VALUE } from '@/lib/list-params';
import * as toast from '@/lib/toast';
import { ACTIVE_FILTER_OPTIONS, ActiveStatus } from '../_components/active-status';
import { useMasterList } from '../_components/use-master-list';
import { ItemMasterTabs } from './_components/item-master-tabs';
import { ITEM_STATUS_FILTER_OPTIONS, ItemStatusChip } from './_components/item-status-chip';

const t = terminology.items;

const SORTABLE: Record<string, ItemListQuery['sortBy']> = {
  code: 'code',
  description: 'description',
};

const columns: DataTableColumn<ItemResponse>[] = [
  { accessorKey: 'code', header: t.columnCode },
  { accessorKey: 'description', header: t.columnDescription },
  {
    id: 'size',
    header: t.columnSize,
    enableSorting: false,
    cell: ({ row }) => row.original.size ?? terminology.labels.notSet,
  },
  {
    id: 'category',
    header: t.columnCategory,
    enableSorting: false,
    cell: ({ row }) => row.original.category.name,
  },
  {
    id: 'unit',
    header: t.columnUnit,
    enableSorting: false,
    cell: ({ row }) => row.original.unit.code,
  },
  {
    id: 'use',
    header: t.columnUse,
    enableSorting: false,
    cell: ({ row }) => t.uses[row.original.itemUse],
  },
  {
    id: 'approval',
    header: t.columnApproval,
    enableSorting: false,
    cell: ({ row }) => <ItemStatusChip status={row.original.status} />,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

const USE_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...ITEM_USES.map((use) => ({ value: use, label: t.uses[use] })),
];

function stopPropagation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

export interface ItemsListClientProps {
  data: PagedItemsResponse;
  query: ItemListQuery;
  canManage: boolean;
  /** masters.items.approve: shows the selection column and bulk approval (PD-042). */
  canApprove: boolean;
  categoryOptions: FieldOption[];
  unitOptions: FieldOption[];
}

export function ItemsListClient({
  data,
  query,
  canManage,
  canApprove,
  categoryOptions,
  unitOptions,
}: ItemsListClientProps) {
  const list = useMasterList({
    basePath: '/masters/items',
    query,
    initialFilters: {
      search: query.search ?? '',
      categoryId: query.categoryId ?? ALL_VALUE,
      unitId: query.unitId ?? ALL_VALUE,
      status: query.status ?? ALL_VALUE,
      itemUse: query.itemUse ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  // Only pending items on this page that the API says the user may approve can be selected.
  // Ids picked on another page are ignored, so changing page or filter clears the selection.
  const approvableIds = useMemo(
    () => data.items.filter((item) => item.canApprove).map((item) => item.id),
    [data.items],
  );
  const selectedIds = approvableIds.filter((id) => picked.has(id));
  const showBulk = canApprove && approvableIds.length > 0;

  function toggle(id: string, checked: boolean): void {
    setPicked((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  const tableColumns = useMemo<DataTableColumn<ItemResponse>[]>(() => {
    if (!showBulk) {
      return columns;
    }

    const selectColumn: DataTableColumn<ItemResponse> = {
      id: 'select',
      header: t.columnSelect,
      enableSorting: false,
      cell: ({ row }) => {
        if (!row.original.canApprove) {
          return null;
        }

        const label = `${t.selectItem} ${row.original.code}`;

        return (
          <span className="inline-flex" onClick={stopPropagation} onKeyDown={stopPropagation}>
            <Checkbox
              checked={picked.has(row.original.id)}
              onCheckedChange={(checked) => toggle(row.original.id, checked === true)}
              aria-label={label}
            />
          </span>
        );
      },
    };

    return [selectColumn, ...columns];
  }, [showBulk, picked]);

  async function approveSelected(ids: string[], text: string): Promise<void> {
    setBusy(true);
    const result = await apiRequest<BulkApproveItemsResponse>('POST', '/api/items/bulk-approve', {
      ids,
      remarks: text.trim(),
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(messageForApiError(result.code));
      return;
    }

    toast.success(`${result.data.approved} ${t.bulkApprovedSuffix}`);

    if (result.data.skippedIds.length > 0) {
      toast.info(`${result.data.skippedIds.length} ${t.bulkSkippedSuffix}`);
    }

    setPicked(new Set());
    list.router.refresh();
  }

  function closeConfirm(): void {
    setConfirmOpen(false);
    setRemarks('');
  }

  const filterFields: FilterField[] = [
    { key: 'search', label: t.searchLabel, type: 'text' },
    ...(categoryOptions.length === 0
      ? []
      : [
          {
            key: 'categoryId',
            label: t.filterCategory,
            type: 'select' as const,
            options: [{ value: ALL_VALUE, label: terminology.filters.all }, ...categoryOptions],
          },
        ]),
    ...(unitOptions.length === 0
      ? []
      : [
          {
            key: 'unitId',
            label: t.filterUnit,
            type: 'select' as const,
            options: [{ value: ALL_VALUE, label: terminology.filters.all }, ...unitOptions],
          },
        ]),
    {
      key: 'status',
      label: t.filterApproval,
      type: 'select',
      options: ITEM_STATUS_FILTER_OPTIONS,
    },
    {
      key: 'itemUse',
      label: t.filterUse,
      type: 'select',
      options: USE_FILTER_OPTIONS,
    },
    {
      key: 'isActive',
      label: terminology.masters.statusFilter,
      type: 'select',
      options: ACTIVE_FILTER_OPTIONS,
    },
  ];

  const selectedLabel = `${selectedIds.length} ${t.selectedSuffix}`;
  const countLabel = `${t.bulkApproveCountLabel} ${selectedIds.length}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.items}
        subtitle={terminology.itemMaster.subtitle}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => list.router.push('/masters/items/import')}
              >
                {terminology.itemImport.openImport}
              </Button>
              <Button type="button" onClick={() => list.router.push('/masters/items/new')}>
                {t.newItem}
              </Button>
            </div>
          ) : undefined
        }
      />
      <ItemMasterTabs />
      <FilterBar
        fields={filterFields}
        value={list.filters}
        onChange={list.handleFilterChange}
        onReset={list.handleReset}
      />
      {showBulk ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
          <span className="text-sm font-medium text-foreground">{selectedLabel}</span>
          <span className="text-xs text-muted-foreground">{t.bulkHint}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPicked(new Set(approvableIds))}
            >
              {t.selectAllPending}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => setPicked(new Set())}
            >
              {t.clearSelection}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedIds.length === 0 || busy}
              onClick={() => setConfirmOpen(true)}
            >
              {t.bulkApprove}
            </Button>
          </div>
        </div>
      ) : null}
      <DataTable
        columns={tableColumns}
        data={data.items}
        totalRows={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sorting={list.sorting}
        onPageChange={(page) => list.navigate({ page })}
        onPageSizeChange={(pageSize) => list.navigate({ pageSize, page: 1 })}
        onSortingChange={list.handleSortingChange}
        onRowClick={(item) => list.router.push(`/masters/items/${item.id}`)}
      />
      {confirmOpen ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => (next ? undefined : closeConfirm())}
          title={t.bulkApproveTitle}
          description={t.bulkApproveDescription}
          confirmLabel={t.bulkApprove}
          confirmDisabled={selectedIds.length === 0 || busy}
          onConfirm={() => void approveSelected(selectedIds, remarks)}
        >
          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-foreground">{countLabel}</p>
            <Label htmlFor="bulk-approve-remarks">{t.remarksLabel}</Label>
            <Textarea
              id="bulk-approve-remarks"
              rows={3}
              maxLength={500}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.remarksOptionalHint}</p>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
