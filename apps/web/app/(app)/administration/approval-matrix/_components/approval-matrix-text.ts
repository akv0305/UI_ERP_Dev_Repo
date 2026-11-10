import type { IndentScopeSummary } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { messageForApiError } from '@/lib/api/client';
import type { ApprovalBand } from '@/lib/approval-bands';
import { formatINR } from '@/lib/format';

const t = terminology.approvalMatrix;

export const APPROVAL_MATRIX_PATH = '/administration/approval-matrix';

export function editPath(workflowId?: string): string {
  return workflowId === undefined
    ? `${APPROVAL_MATRIX_PATH}/edit`
    : `${APPROVAL_MATRIX_PATH}/edit?workflowId=${encodeURIComponent(workflowId)}`;
}

export function scopeLabel(company: IndentScopeSummary | null): string {
  return company === null ? t.allCompanies : `${company.code} · ${company.name}`;
}

/** "2,00,000" -> "200000"; the API takes plain amounts. */
export function normalizeAmount(value: string): string {
  return value.replace(/,/g, '').trim();
}

export function bandLabel(band: ApprovalBand, isFirst: boolean): string {
  if (band.to === null) {
    return isFirst ? t.bandAny : `${t.bandAbove} ${formatINR(band.from)}`;
  }

  return isFirst
    ? `${t.bandUpTo} ${formatINR(band.to)}`
    : `${t.bandAbove} ${formatINR(band.from)} ${t.bandUpToJoin} ${formatINR(band.to)}`;
}

export function routeText(roles: readonly string[]): string {
  return roles.join(t.routeArrow);
}

export function approvalMatrixError(code: string | undefined): string {
  const own = t.apiErrors as Record<string, string>;

  return (code !== undefined ? own[code] : undefined) ?? messageForApiError(code);
}
