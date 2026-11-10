'use client';

import {
  APPROVAL_AMOUNT_BASES,
  ApprovalWorkflowLevelInput,
  MAX_APPROVAL_LEVELS,
  SaveApprovalWorkflowRequest,
  compareAmounts,
  type ApprovalAmountBasis,
  type ApprovalRoleSummary,
  type ApprovalWorkflowResponse,
  type IndentScopeSummary,
} from '@uie/contracts';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest } from '@/lib/api/client';
import { formatINR } from '@/lib/format';
import * as toast from '@/lib/toast';
import { ApprovalBandsTable } from './_components/approval-bands-table';
import {
  APPROVAL_MATRIX_PATH,
  approvalMatrixError,
  normalizeAmount,
  scopeLabel,
} from './_components/approval-matrix-text';

const t = terminology.approvalMatrix;
const REMARKS_MAX = 300;

/** edit = new version of a current one; all = first all-companies workflow; override = new company override. */
export type WorkflowFormMode = 'edit' | 'all' | 'override';

interface LevelRow {
  key: string;
  roleId: string;
  minAmount: string;
  makerCountsAsApproved: boolean;
}

let keySeed = 0;

function newKey(): string {
  keySeed += 1;
  return `level-${keySeed}`;
}

function isAmount(value: string): boolean {
  return ApprovalWorkflowLevelInput.shape.minAmount.safeParse(normalizeAmount(value)).success;
}

/** Level 1 always applies at 0 and is the only level where the maker's submit can count (PD-054, OQ-98 b). */
function fixLevelOne(rows: LevelRow[]): LevelRow[] {
  return rows.map((row, index) =>
    index === 0 ? { ...row, minAmount: '0' } : { ...row, makerCountsAsApproved: false },
  );
}

/** Same rules as SaveApprovalWorkflowRequest, with on-screen messages. */
function validateRows(rows: readonly LevelRow[]): Map<string, string> {
  const errors = new Map<string, string>();
  const seen = new Set<string>();
  let previous: string | null = null;

  for (const row of rows) {
    const amount = normalizeAmount(row.minAmount);

    if (row.roleId === '') {
      errors.set(row.key, t.errors.roleRequired);
    } else if (seen.has(row.roleId)) {
      errors.set(row.key, t.errors.roleRepeated);
    } else if (!isAmount(amount)) {
      errors.set(row.key, t.errors.amountInvalid);
    } else if (previous !== null && compareAmounts(amount, previous) < 0) {
      errors.set(row.key, t.errors.amountLower);
    }

    if (row.roleId !== '') {
      seen.add(row.roleId);
    }

    if (isAmount(amount)) {
      previous = amount;
    }
  }

  return errors;
}

export interface WorkflowFormProps {
  mode: WorkflowFormMode;
  workflow?: ApprovalWorkflowResponse;
  roles: ApprovalRoleSummary[];
  /** Override mode: companies that have no override yet. */
  companies: IndentScopeSummary[];
}

export function WorkflowForm({ mode, workflow, roles, companies }: WorkflowFormProps) {
  const router = useRouter();
  const documentType = workflow?.documentType ?? 'PURCHASE_ORDER';
  const [rows, setRows] = useState<LevelRow[]>(() =>
    workflow === undefined
      ? [{ key: newKey(), roleId: '', minAmount: '0', makerCountsAsApproved: false }]
      : workflow.levels.map((level) => ({
          key: newKey(),
          roleId: level.role.id,
          minAmount: level.minAmount,
          makerCountsAsApproved: level.makerCountsAsApproved,
        })),
  );
  const [amountBasis, setAmountBasis] = useState<ApprovalAmountBasis>(
    workflow?.amountBasis ?? 'NET_AMOUNT',
  );
  const [companyId, setCompanyId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(() => new Map());
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Roles of the edited version that are no longer offered stay visible, marked; the API refuses them. */
  const roleOptions = useMemo(() => {
    const offered = new Set(roles.map((role) => role.id));
    const missing = (workflow?.levels ?? [])
      .filter((level) => !offered.has(level.role.id))
      .map((level) => ({ id: level.role.id, label: `${level.role.name} ${t.inactiveSuffix}` }));

    return [...roles.map((role) => ({ id: role.id, label: role.name })), ...missing];
  }, [roles, workflow]);

  const roleNames = useMemo(
    () => new Map(roleOptions.map((option) => [option.id, option.label] as const)),
    [roleOptions],
  );

  const previewLevels = rows
    .filter((row) => row.roleId !== '' && isAmount(row.minAmount))
    .map((row) => ({
      minAmount: normalizeAmount(row.minAmount),
      roleName: roleNames.get(row.roleId) ?? '',
    }));

  function update(key: string, patch: Partial<LevelRow>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function move(index: number, offset: -1 | 1): void {
    setRows((current) => {
      const target = index + offset;

      if (target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);

      if (moved === undefined) {
        return current;
      }

      next.splice(target, 0, moved);
      return fixLevelOne(next);
    });
  }

  function remove(key: string): void {
    setRows((current) =>
      current.length <= 1 ? current : fixLevelOne(current.filter((row) => row.key !== key)),
    );
  }

  function add(): void {
    setRows((current) =>
      current.length >= MAX_APPROVAL_LEVELS
        ? current
        : [...current, { key: newKey(), roleId: '', minAmount: '', makerCountsAsApproved: false }],
    );
  }

  async function handleSave(): Promise<void> {
    setFormError(null);

    const errors = validateRows(rows);
    const needsCompany = mode === 'override' && companyId === '';

    setRowErrors(errors);
    setCompanyError(needsCompany ? t.errors.companyRequired : null);

    if (errors.size > 0 || needsCompany) {
      return;
    }

    const trimmed = remarks.trim();
    const payload = {
      documentType,
      companyId:
        mode === 'edit' ? (workflow?.company?.id ?? null) : mode === 'override' ? companyId : null,
      amountBasis,
      levels: rows.map((row) => ({
        roleId: row.roleId,
        minAmount: normalizeAmount(row.minAmount),
        makerCountsAsApproved: row.makerCountsAsApproved,
      })),
      ...(trimmed === '' ? {} : { remarks: trimmed }),
    };

    if (!SaveApprovalWorkflowRequest.safeParse(payload).success) {
      setFormError(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    setSaving(true);
    const result = await apiRequest('POST', '/api/approval-workflows', payload);
    setSaving(false);

    if (!result.ok) {
      setFormError(approvalMatrixError(result.code));
      return;
    }

    toast.success(t.saved);
    router.push(APPROVAL_MATRIX_PATH);
    router.refresh();
  }

  const fixedScope = scopeLabel(mode === 'edit' ? (workflow?.company ?? null) : null);

  return (
    <div className="flex flex-col gap-4">
      {formError === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="text-sm font-semibold text-foreground">{t.sectionWorkflow}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{t.fieldDocumentType}</p>
            <p className="text-sm text-foreground">{t.documentTypes[documentType]}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="workflow-company">{t.fieldCompany}</Label>
            {mode === 'override' ? (
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="workflow-company">
                  <SelectValue placeholder={t.selectCompany} />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {scopeLabel(company)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p id="workflow-company" className="text-sm text-foreground">
                {fixedScope}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t.fieldCompanyHint}</p>
            {companyError === null ? null : (
              <p role="alert" className="text-xs text-danger">
                {companyError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="workflow-amount-basis">{t.fieldAmountBasis}</Label>
            <Select
              value={amountBasis}
              onValueChange={(value) => setAmountBasis(value as ApprovalAmountBasis)}
            >
              <SelectTrigger id="workflow-amount-basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPROVAL_AMOUNT_BASES.map((basis) => (
                  <SelectItem key={basis} value={basis}>
                    {t.amountBases[basis]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="workflow-remarks">{t.fieldRemarks}</Label>
            <Textarea
              id="workflow-remarks"
              value={remarks}
              maxLength={REMARKS_MAX}
              onChange={(event) => setRemarks(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.fieldRemarksHint}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-(--card-padding)">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t.sectionLevels}</h2>
          <p className="text-xs text-muted-foreground">{t.levelsHint}</p>
          <p className="text-xs text-muted-foreground">{t.makerCountsHint}</p>
        </div>

        <div className="hidden gap-3 border-b border-border pb-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[4rem_1fr_14rem_12rem_auto]">
          <span>{t.columnLevel}</span>
          <span>{t.columnRole}</span>
          <span>{t.columnAppliesAbove}</span>
          <span>{t.columnMakerCounts}</span>
          <span />
        </div>

        <ul className="divide-y divide-border">
          {rows.map((row, index) => {
            const error = rowErrors.get(row.key);
            const amount = normalizeAmount(row.minAmount);
            const isFirst = index === 0;
            const makerId = `maker-${row.key}`;
            const amountHint = isFirst
              ? t.levelOneFixed
              : isAmount(amount)
                ? formatINR(amount)
                : t.amountHint;

            return (
              <li key={row.key} className="flex flex-col gap-1 py-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[4rem_1fr_14rem_12rem_auto] md:items-start">
                  <span className="pt-2 text-sm font-medium text-foreground">{index + 1}</span>

                  <Select
                    value={row.roleId}
                    onValueChange={(value) => update(row.key, { roleId: value })}
                  >
                    <SelectTrigger aria-label={t.columnRole}>
                      <SelectValue placeholder={t.selectRole} />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="space-y-1">
                    <Input
                      aria-label={t.columnAppliesAbove}
                      inputMode="decimal"
                      value={isFirst ? '0' : row.minAmount}
                      disabled={isFirst}
                      onChange={(event) => update(row.key, { minAmount: event.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">{amountHint}</p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {isFirst ? (
                      <>
                        <Checkbox
                          id={makerId}
                          checked={row.makerCountsAsApproved}
                          onCheckedChange={(next) =>
                            update(row.key, { makerCountsAsApproved: next === true })
                          }
                        />
                        <Label htmlFor={makerId} className="font-normal">
                          {t.makerCountsLabel}
                        </Label>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {terminology.labels.notSet}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.moveUp}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.moveDown}
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.removeLevel}
                      disabled={rows.length <= 1}
                      onClick={() => remove(row.key)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
                {error === undefined ? null : (
                  <p role="alert" className="text-xs text-danger">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div>
          <Button
            type="button"
            variant="outline"
            disabled={rows.length >= MAX_APPROVAL_LEVELS}
            onClick={add}
          >
            <Plus className="size-4" aria-hidden />
            {t.addLevel}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="text-sm font-semibold text-foreground">{t.sectionRoute}</h2>
        <p className="text-xs text-muted-foreground">{t.routeHint}</p>
        <ApprovalBandsTable levels={previewLevels} />
      </section>

      <p className="text-xs text-muted-foreground">{t.newVersionNotice}</p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => router.push(APPROVAL_MATRIX_PATH)}
        >
          {terminology.actions.cancel}
        </Button>
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? t.saving : terminology.actions.save}
        </Button>
      </div>
    </div>
  );
}
