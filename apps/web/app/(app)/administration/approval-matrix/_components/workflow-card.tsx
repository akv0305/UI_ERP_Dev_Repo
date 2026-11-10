import type { ApprovalWorkflowResponse } from '@uie/contracts';
import Link from 'next/link';
import { KeyValueGrid } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDateTime, formatINR } from '@/lib/format';
import { ApprovalBandsTable } from './approval-bands-table';
import { editPath, scopeLabel } from './approval-matrix-text';

export interface WorkflowCardProps {
  workflow: ApprovalWorkflowResponse;
  canManage: boolean;
}

export function WorkflowCard({ workflow, canManage }: WorkflowCardProps) {
  const t = terminology.approvalMatrix;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-(--card-padding)">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            {scopeLabel(workflow.company)}
          </h2>
          <p className="text-xs text-muted-foreground">{t.documentTypes[workflow.documentType]}</p>
        </div>
        {canManage ? (
          <Button asChild variant="outline">
            <Link href={editPath(workflow.id)}>{t.edit}</Link>
          </Button>
        ) : null}
      </div>

      <KeyValueGrid
        columns={3}
        items={[
          { label: t.infoVersion, value: workflow.version },
          { label: t.infoAmountBasis, value: t.amountBases[workflow.amountBasis] },
          { label: t.infoSavedAt, value: formatDateTime(workflow.createdAt) },
          { label: t.infoSavedBy, value: workflow.createdBy.displayName },
          { label: t.infoRemarks, value: workflow.remarks ?? terminology.labels.notSet },
        ]}
      />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t.sectionLevels}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{t.columnLevel}</th>
              <th className="py-2 pr-4 font-medium">{t.columnRole}</th>
              <th className="py-2 pr-4 font-medium">{t.columnAppliesAbove}</th>
              <th className="py-2 font-medium">{t.columnMakerCounts}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workflow.levels.map((level) => (
              <tr key={level.levelNo}>
                <td className="py-2 pr-4 text-foreground">{level.levelNo}</td>
                <td className="py-2 pr-4 text-foreground">{level.role.name}</td>
                <td className="py-2 pr-4 text-foreground">
                  {level.levelNo === 1 ? t.levelOneFixed : formatINR(level.minAmount)}
                </td>
                <td className="py-2 text-foreground">
                  {level.levelNo !== 1
                    ? terminology.labels.notSet
                    : level.makerCountsAsApproved
                      ? terminology.labels.yes
                      : terminology.labels.no}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t.sectionRoute}</h3>
        <ApprovalBandsTable
          levels={workflow.levels.map((level) => ({
            minAmount: level.minAmount,
            roleName: level.role.name,
          }))}
        />
      </div>
    </section>
  );
}
