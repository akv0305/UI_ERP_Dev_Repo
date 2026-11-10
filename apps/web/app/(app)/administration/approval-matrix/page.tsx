import { ApprovalWorkflowListResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { editPath } from './_components/approval-matrix-text';
import { WorkflowCard } from './_components/workflow-card';

export default async function ApprovalMatrixPage() {
  const t = terminology.approvalMatrix;
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('administration.approvalMatrix.view')) {
    return <NotAuthorised />;
  }

  const result = await apiGet('/api/approval-workflows', ApprovalWorkflowListResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const canManage = permissions.includes('administration.approvalMatrix.manage');
  const workflows = result.data.items;
  const hasAllCompanies = workflows.some((workflow) => workflow.company === null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.approvalMatrix}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={editPath()}>{hasAllCompanies ? t.addOverride : t.setUp}</Link>
            </Button>
          ) : undefined
        }
      />
      {workflows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-(--card-padding) text-sm text-muted-foreground">
          {t.empty}
        </p>
      ) : (
        workflows.map((workflow) => (
          <WorkflowCard key={workflow.id} workflow={workflow} canManage={canManage} />
        ))
      )}
    </div>
  );
}
