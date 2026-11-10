import { ApprovalWorkflowFormOptionsResponse, ApprovalWorkflowListResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { scopeLabel } from '../_components/approval-matrix-text';
import { WorkflowForm, type WorkflowFormMode } from '../workflow-form';

type SearchParams = Promise<{ workflowId?: string | string[] }>;

export default async function EditApprovalWorkflowPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = terminology.approvalMatrix;

  if (!(await requirePermission('administration.approvalMatrix.manage'))) {
    return <NotAuthorised />;
  }

  const params = await searchParams;
  const workflowId = typeof params.workflowId === 'string' ? params.workflowId : undefined;

  const [list, options] = await Promise.all([
    apiGet('/api/approval-workflows', ApprovalWorkflowListResponse),
    apiGet('/api/approval-workflows/form-options', ApprovalWorkflowFormOptionsResponse),
  ]);

  if (list.kind === 'forbidden' || options.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (list.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  const current = list.data.items;
  // Only a current version can be edited; saving it creates the next version (OQ-96, OQ-123).
  const workflow =
    workflowId === undefined ? undefined : current.find((item) => item.id === workflowId);

  if (workflowId !== undefined && workflow === undefined) {
    return <ErrorState description={t.notCurrent} />;
  }

  const hasAllCompanies = current.some((item) => item.company === null);
  const mode: WorkflowFormMode =
    workflow !== undefined ? 'edit' : hasAllCompanies ? 'override' : 'all';
  const taken = new Set(
    current.flatMap((item) => (item.company === null ? [] : [item.company.id])),
  );
  const freeCompanies = options.data.companies.filter((company) => !taken.has(company.id));

  if (mode === 'override' && freeCompanies.length === 0) {
    return <ErrorState description={t.noCompaniesLeft} />;
  }

  const title = mode === 'edit' ? t.editTitle : mode === 'all' ? t.newTitle : t.newOverrideTitle;
  const subtitle =
    workflow === undefined
      ? undefined
      : `${scopeLabel(workflow.company)} · ${t.infoVersion} ${workflow.version}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} subtitle={subtitle} />
      <WorkflowForm
        mode={mode}
        workflow={workflow}
        roles={options.data.roles}
        companies={freeCompanies}
      />
    </div>
  );
}
