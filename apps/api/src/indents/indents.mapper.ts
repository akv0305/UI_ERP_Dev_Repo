import type { Prisma } from '@prisma/client';
import type { IndentDetailResponse, IndentLineResponse, IndentResponse } from '@uie/contracts';
import type { IndentFlags } from './indent-rules';

const actorSelect = { select: { id: true, displayName: true } } as const;
const scopeSelect = { select: { id: true, code: true, name: true } } as const;

export const indentInclude = {
  company: { select: { id: true, code: true, legalName: true } },
  project: scopeSelect,
  site: scopeSelect,
  store: scopeSelect,
  submittedBy: actorSelect,
  decidedBy: actorSelect,
  cancelledBy: actorSelect,
  createdBy: actorSelect,
  _count: { select: { lines: true } },
} satisfies Prisma.IndentInclude;

export const indentDetailInclude = {
  ...indentInclude,
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      item: {
        select: {
          id: true,
          code: true,
          description: true,
          size: true,
          unit: { select: { code: true, decimalPlaces: true } },
        },
      },
    },
  },
} satisfies Prisma.IndentInclude;

export type IndentWithRelations = Prisma.IndentGetPayload<{ include: typeof indentInclude }>;
export type IndentWithDetails = Prisma.IndentGetPayload<{ include: typeof indentDetailInclude }>;

type IndentLineRow = IndentWithDetails['lines'][number];

/** @db.Date -> 'YYYY-MM-DD'. */
export function isoDateOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toIndentResponse(indent: IndentWithRelations, flags: IndentFlags): IndentResponse {
  return {
    id: indent.id,
    number: indent.number,
    fiscalYear: indent.fiscalYear,
    status: indent.status,
    company: { id: indent.company.id, code: indent.company.code, name: indent.company.legalName },
    project: indent.project,
    site: indent.site,
    store: indent.store,
    indentDate: isoDateOf(indent.indentDate),
    requiredByDate: indent.requiredByDate === null ? null : isoDateOf(indent.requiredByDate),
    requestedBy: indent.requestedBy,
    remarks: indent.remarks,
    lineCount: indent._count.lines,
    submittedAt: indent.submittedAt?.toISOString() ?? null,
    submittedBy: indent.submittedBy,
    decidedAt: indent.decidedAt?.toISOString() ?? null,
    decidedBy: indent.decidedBy,
    decisionRemarks: indent.decisionRemarks,
    cancelledAt: indent.cancelledAt?.toISOString() ?? null,
    cancelledBy: indent.cancelledBy,
    cancelRemarks: indent.cancelRemarks,
    createdBy: indent.createdBy,
    createdAt: indent.createdAt.toISOString(),
    updatedAt: indent.updatedAt.toISOString(),
    ...flags,
  };
}

/** Quantities are shown with the unit's decimal places (validated on save). */
export function toIndentLineResponse(row: IndentLineRow): IndentLineResponse {
  const places = row.item.unit.decimalPlaces;

  return {
    id: row.id,
    lineNo: row.lineNo,
    item: {
      id: row.item.id,
      code: row.item.code,
      description: row.item.description,
      size: row.item.size,
      unitCode: row.item.unit.code,
      decimalPlaces: places,
    },
    requiredQty: row.requiredQty.toFixed(places),
    approvedQty: row.approvedQty === null ? null : row.approvedQty.toFixed(places),
    purpose: row.purpose,
    remarks: row.remarks,
  };
}

export function toIndentDetailResponse(
  indent: IndentWithDetails,
  flags: IndentFlags,
): IndentDetailResponse {
  return { ...toIndentResponse(indent, flags), lines: indent.lines.map(toIndentLineResponse) };
}

/** Readable values for the Audit Log: codes instead of ids, lines with item codes. */
export function toIndentAuditSnapshot(indent: IndentWithDetails): Record<string, unknown> {
  return {
    number: indent.number,
    fiscalYear: indent.fiscalYear,
    status: indent.status,
    project: indent.project.code,
    site: indent.site.code,
    store: indent.store?.code ?? null,
    indentDate: isoDateOf(indent.indentDate),
    requiredByDate: indent.requiredByDate === null ? null : isoDateOf(indent.requiredByDate),
    requestedBy: indent.requestedBy,
    remarks: indent.remarks,
    decisionRemarks: indent.decisionRemarks,
    cancelRemarks: indent.cancelRemarks,
    lines: indent.lines.map((line) => ({
      lineNo: line.lineNo,
      item: line.item.code,
      requiredQty: line.requiredQty.toFixed(3),
      approvedQty: line.approvedQty === null ? null : line.approvedQty.toFixed(3),
      purpose: line.purpose,
      remarks: line.remarks,
    })),
  };
}
