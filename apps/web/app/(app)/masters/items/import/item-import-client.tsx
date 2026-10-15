'use client';

import {
  ITEM_IMPORT_MAX_FILE_BYTES,
  ITEM_USES,
  ItemImportPreviewResponse,
  type ItemImportCheckResponse,
  type ItemImportCommitResponse,
  type ItemImportIssue,
  type ItemImportRowInput,
  type ItemImportRowResult,
  type ItemImportUnmatched,
  type ItemUse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog, PageHeader, type FieldOption } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError, type ApiCallResult } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { cn } from '@/lib/utils';
import { ItemMasterTabs } from '../_components/item-master-tabs';

const t = terminology.itemImport;
const PAGE_SIZE = 100;
const SELECT_CLASS =
  'h-(--field-height) w-full min-w-32 rounded-md border border-input bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

type View = 'all' | ItemImportRowResult['status'];

const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: t.viewAll },
  { value: 'ERROR', label: t.viewError },
  { value: 'WARNING', label: t.viewWarning },
  { value: 'READY', label: t.viewReady },
];

type Stage =
  | { kind: 'upload' }
  | { kind: 'grid'; sheetName: string; headerRowNumber: number }
  | { kind: 'done'; result: ItemImportCommitResponse };

type Busy = 'reading' | 'checking' | 'importing' | null;

/** Only the editable fields go back to the API (status and issues are recalculated there). */
function toInput(row: ItemImportRowResult): ItemImportRowInput {
  return {
    rowNumber: row.rowNumber,
    description: row.description,
    size: row.size,
    unitText: row.unitText,
    categoryText: row.categoryText,
    unitId: row.unitId,
    categoryId: row.categoryId,
    hsnCode: row.hsnCode,
    gstRate: row.gstRate,
    itemUse: row.itemUse,
  };
}

function issueText(issue: ItemImportIssue): string {
  return [
    t.issues[issue.code],
    issue.refCode,
    issue.refRow === null ? null : String(issue.refRow),
    issue.refText,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' ');
}

function rowClass(status: ItemImportRowResult['status']): string {
  if (status === 'ERROR') {
    return 'bg-danger/10';
  }

  return status === 'WARNING' ? 'bg-warning/10' : '';
}

function unmatchedLabel(entry: ItemImportUnmatched): string {
  return `${entry.text} (${entry.rows} ${t.rowsSuffix})`;
}

/** The upload is multipart, so it does not go through apiRequest (JSON only). */
async function uploadPreview(file: File): Promise<ApiCallResult<ItemImportPreviewResponse>> {
  const form = new FormData();

  form.append('file', file);

  try {
    const response = await fetch('/api/items/import/preview', { method: 'POST', body: form });
    const payload: unknown = await response.json().catch(() => null);

    if (response.ok) {
      const parsed = ItemImportPreviewResponse.safeParse(payload);

      return parsed.success
        ? { ok: true, data: parsed.data }
        : { ok: false, status: response.status, code: undefined };
    }

    const code = (payload as { error?: { code?: string } } | null)?.error?.code;

    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: undefined };
  }
}

interface UnmatchedPanelProps {
  title: string;
  entries: readonly ItemImportUnmatched[];
  options: readonly FieldOption[];
  disabled: boolean;
  onPick: (text: string, id: string) => void;
}

function UnmatchedPanel({ title, entries, options, disabled, onPick }: UnmatchedPanelProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <div key={entry.text} className="flex items-center gap-2">
            <span className="w-48 shrink-0 truncate text-sm text-foreground">
              {unmatchedLabel(entry)}
            </span>
            <select
              aria-label={entry.text}
              className={SELECT_CLASS}
              value=""
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value !== '') {
                  onPick(entry.text, event.target.value);
                }
              }}
            >
              <option value="">{t.notChosen}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ItemImportClientProps {
  categoryOptions: FieldOption[];
  unitOptions: FieldOption[];
}

export function ItemImportClient({ categoryOptions, unitOptions }: ItemImportClientProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: 'upload' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [check, setCheck] = useState<ItemImportCheckResponse | null>(null);
  const [rows, setRows] = useState<ItemImportRowResult[]>([]);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>('all');
  const [page, setPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkUse, setBulkUse] = useState<ItemUse>('STOCK_AND_ISSUE');

  const visible = useMemo(
    () => (view === 'all' ? rows : rows.filter((row) => row.status === view)),
    [rows, view],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const importable = rows.filter((row) => row.status !== 'ERROR').length;
  const skipping = rows.length - importable;

  function loadResult(result: ItemImportCheckResponse): void {
    setCheck(result);
    setRows(result.rows);
    setDirty(false);
  }

  function reset(): void {
    setStage({ kind: 'upload' });
    setFile(null);
    setCheck(null);
    setRows([]);
    setDirty(false);
    setView('all');
    setPage(0);
  }

  async function readFile(): Promise<void> {
    if (file === null) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error(t.fileWrongType);
      return;
    }

    if (file.size > ITEM_IMPORT_MAX_FILE_BYTES) {
      toast.error(t.fileTooLarge);
      return;
    }

    setBusy('reading');
    const result = await uploadPreview(file);
    setBusy(null);

    if (!result.ok) {
      toast.error(result.status === 413 ? t.fileTooLarge : messageForApiError(result.code));
      return;
    }

    loadResult(result.data);
    setView('all');
    setPage(0);
    setStage({
      kind: 'grid',
      sheetName: result.data.sheetName,
      headerRowNumber: result.data.headerRowNumber,
    });
  }

  async function runCheck(next: ItemImportRowResult[]): Promise<void> {
    setBusy('checking');
    const result = await apiRequest<ItemImportCheckResponse>('POST', '/api/items/import/check', {
      rows: next.map(toInput),
    });
    setBusy(null);

    if (result.ok) {
      loadResult(result.data);
    } else {
      setRows(next);
      setDirty(true);
      toast.error(messageForApiError(result.code));
    }
  }

  async function runImport(): Promise<void> {
    setConfirmOpen(false);
    setBusy('importing');
    const result = await apiRequest<ItemImportCommitResponse>('POST', '/api/items/import', {
      rows: rows.map(toInput),
    });
    setBusy(null);

    if (result.ok) {
      toast.success(t.resultMessage);
      setStage({ kind: 'done', result: result.data });
    } else {
      toast.error(messageForApiError(result.code));
    }
  }

  /** Edits to checked fields lock Import until "Check again"; item use does not affect the check. */
  function updateRow(rowNumber: number, patch: Partial<ItemImportRowInput>, affectsCheck = true) {
    setRows((current) =>
      current.map((row) => (row.rowNumber === rowNumber ? { ...row, ...patch } : row)),
    );

    if (affectsCheck) {
      setDirty(true);
    }
  }

  /** CQ-103: one pick for every row with this spelling, then check again straight away. */
  function applySpelling(kind: 'unit' | 'category', text: string, id: string): void {
    const next = rows.map((row) => {
      if (kind === 'unit' && row.unitText === text && row.unitId === null) {
        return { ...row, unitId: id };
      }

      if (kind === 'category' && row.categoryText === text && row.categoryId === null) {
        return { ...row, categoryId: id };
      }

      return row;
    });

    void runCheck(next);
  }

  function applyUseToAll(): void {
    setRows((current) => current.map((row) => ({ ...row, itemUse: bulkUse })));
    toast.success(t.appliedToAll);
  }

  const header = <PageHeader title={t.title} subtitle={t.subtitle} />;

  if (stage.kind === 'done') {
    const { result } = stage;
    const codes =
      result.firstCode === null
        ? terminology.labels.notSet
        : `${result.firstCode} – ${result.lastCode ?? result.firstCode}`;
    const skippedRows = result.rows.filter((row) => row.code === null);

    return (
      <div className="flex flex-col gap-4">
        {header}
        <ItemMasterTabs />
        <div className="rounded-md border border-border p-4">
          <p className="text-base font-medium text-foreground">{t.resultTitle}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t.resultImported}</dt>
              <dd className="text-lg font-semibold text-foreground">{result.imported}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.resultSkipped}</dt>
              <dd className="text-lg font-semibold text-foreground">{result.skipped}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.resultCodes}</dt>
              <dd className="text-lg font-semibold text-foreground">{codes}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => router.push('/masters/items?status=PENDING_APPROVAL')}
            >
              {t.viewPending}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              {t.importAnother}
            </Button>
          </div>
        </div>
        {skippedRows.length > 0 ? (
          <div className="rounded-md border border-border">
            <p className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
              {t.resultSkippedTitle}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t.columnRow}</th>
                  <th className="px-3 py-2 font-medium">{t.columnIssues}</th>
                </tr>
              </thead>
              <tbody>
                {skippedRows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 align-top">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      {row.issues.map((issue) => (
                        <p key={issue.code}>{issueText(issue)}</p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  if (stage.kind === 'upload' || check === null) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ItemMasterTabs />
        <div className="max-w-xl space-y-2 rounded-md border border-border p-4">
          <Label htmlFor="item-import-file">{t.fileLabel}</Label>
          <Input
            id="item-import-file"
            type="file"
            accept=".xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">{t.fileHint}</p>
          <Button
            type="button"
            disabled={file === null || busy !== null}
            onClick={() => void readFile()}
          >
            {busy === 'reading' ? t.reading : t.upload}
          </Button>
        </div>
      </div>
    );
  }

  const sheetInfo = `${t.sheetInfo} ${stage.sheetName}, ${t.headerRowInfo} ${stage.headerRowNumber}`;
  const pageInfo = `${safePage + 1} ${t.pageOf} ${pageCount}`;
  const tiles = [
    { label: t.summaryTotal, value: check.summary.total, tone: '' },
    { label: t.summaryReady, value: check.summary.ready, tone: '' },
    { label: t.summaryWarning, value: check.summary.warning, tone: 'bg-warning/10' },
    { label: t.summaryError, value: check.summary.error, tone: 'bg-danger/10' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {header}
      <ItemMasterTabs />
      <p className="text-sm text-muted-foreground">{sheetInfo}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn('rounded-md border border-border p-3', tile.tone)}>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-lg font-semibold text-foreground">{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-foreground">{t.legend}</p>

      {check.unmatchedUnits.length + check.unmatchedCategories.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t.unmatchedHint}</p>
          <UnmatchedPanel
            title={t.unmatchedUnitsTitle}
            entries={check.unmatchedUnits}
            options={unitOptions}
            disabled={busy !== null || dirty}
            onPick={(text, id) => applySpelling('unit', text, id)}
          />
          <UnmatchedPanel
            title={t.unmatchedCategoriesTitle}
            entries={check.unmatchedCategories}
            options={categoryOptions}
            disabled={busy !== null || dirty}
            onPick={(text, id) => applySpelling('category', text, id)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="item-import-view">{t.viewLabel}</Label>
          <select
            id="item-import-view"
            className={SELECT_CLASS}
            value={view}
            onChange={(event) => {
              setView(event.target.value as View);
              setPage(0);
            }}
          >
            {VIEWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="item-import-bulk-use">{t.applyItemUseLabel}</Label>
          <div className="flex gap-2">
            <select
              id="item-import-bulk-use"
              className={SELECT_CLASS}
              value={bulkUse}
              onChange={(event) => setBulkUse(event.target.value as ItemUse)}
            >
              {ITEM_USES.map((use) => (
                <option key={use} value={use}>
                  {terminology.items.uses[use]}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={applyUseToAll}>
              {t.applyToAll}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">{t.columnRow}</th>
              <th className="px-2 py-2 font-medium">{t.columnDescription}</th>
              <th className="px-2 py-2 font-medium">{t.columnSize}</th>
              <th className="px-2 py-2 font-medium">{t.columnUnit}</th>
              <th className="px-2 py-2 font-medium">{t.columnCategory}</th>
              <th className="px-2 py-2 font-medium">{t.columnUse}</th>
              <th className="px-2 py-2 font-medium">{t.columnHsn}</th>
              <th className="px-2 py-2 font-medium">{t.columnGst}</th>
              <th className="px-2 py-2 font-medium">{t.columnIssues}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.rowNumber}
                className={cn(
                  'border-b border-border align-top last:border-0',
                  rowClass(row.status),
                )}
              >
                <td className="px-2 py-2">{row.rowNumber}</td>
                <td className="min-w-56 px-2 py-2">
                  <Input
                    aria-label={t.columnDescription}
                    value={row.description}
                    onChange={(event) =>
                      updateRow(row.rowNumber, { description: event.target.value })
                    }
                  />
                </td>
                <td className="min-w-28 px-2 py-2">
                  <Input
                    aria-label={t.columnSize}
                    value={row.size}
                    onChange={(event) => updateRow(row.rowNumber, { size: event.target.value })}
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={t.columnUnit}
                    className={SELECT_CLASS}
                    value={row.unitId ?? ''}
                    onChange={(event) =>
                      updateRow(row.rowNumber, {
                        unitId: event.target.value === '' ? null : event.target.value,
                      })
                    }
                  >
                    <option value="">{t.notChosen}</option>
                    {unitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {row.unitText === '' ? null : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.fromFile} {row.unitText}
                    </p>
                  )}
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={t.columnCategory}
                    className={SELECT_CLASS}
                    value={row.categoryId ?? ''}
                    onChange={(event) =>
                      updateRow(row.rowNumber, {
                        categoryId: event.target.value === '' ? null : event.target.value,
                      })
                    }
                  >
                    <option value="">{t.notChosen}</option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {row.categoryText === '' ? null : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.fromFile} {row.categoryText}
                    </p>
                  )}
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={t.columnUse}
                    className={SELECT_CLASS}
                    value={row.itemUse}
                    onChange={(event) =>
                      updateRow(row.rowNumber, { itemUse: event.target.value as ItemUse }, false)
                    }
                  >
                    {ITEM_USES.map((use) => (
                      <option key={use} value={use}>
                        {terminology.items.uses[use]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="min-w-24 px-2 py-2">
                  <Input
                    aria-label={t.columnHsn}
                    value={row.hsnCode}
                    onChange={(event) => updateRow(row.rowNumber, { hsnCode: event.target.value })}
                  />
                </td>
                <td className="min-w-20 px-2 py-2">
                  <Input
                    aria-label={t.columnGst}
                    value={row.gstRate}
                    onChange={(event) => updateRow(row.rowNumber, { gstRate: event.target.value })}
                  />
                </td>
                <td className="min-w-56 px-2 py-2">
                  {row.issues.map((issue) => (
                    <p
                      key={issue.code}
                      className={issue.severity === 'error' ? 'text-danger' : 'text-foreground'}
                    >
                      {issueText(issue)}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={safePage === 0}
          onClick={() => setPage(safePage - 1)}
        >
          {t.previous}
        </Button>
        <span className="text-sm text-muted-foreground">{pageInfo}</span>
        <Button
          type="button"
          variant="outline"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage(safePage + 1)}
        >
          {t.next}
        </Button>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background py-3">
        {dirty ? <p className="text-sm text-danger">{t.changedNotice}</p> : null}
        {!dirty && importable === 0 ? (
          <p className="text-sm text-muted-foreground">{t.nothingToImport}</p>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={reset}>
            {t.startOver}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runCheck(rows)}
          >
            {busy === 'checking' ? t.checking : t.checkAgain}
          </Button>
          <Button
            type="button"
            disabled={busy !== null || dirty || importable === 0}
            onClick={() => setConfirmOpen(true)}
          >
            {busy === 'importing' ? t.importing : t.import}
          </Button>
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          open
          title={t.importTitle}
          description={t.importDescription}
          confirmLabel={t.import}
          onOpenChange={(next) => (next ? undefined : setConfirmOpen(false))}
          onConfirm={() => void runImport()}
        >
          <div className="mt-3 space-y-1 text-sm text-foreground">
            <p>
              {t.importCountLabel} {importable}
            </p>
            <p>
              {t.skipCountLabel} {skipping}
            </p>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
