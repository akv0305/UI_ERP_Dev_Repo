import { EmployeeFormOptionsResponse, EmployeeResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/format';
import { ActiveStatus } from '@/app/(app)/masters/_components/active-status';
import {
  codeName,
  dateText,
  employeeSubtitle,
  userText,
  workLocationText,
} from '../_components/employee-text';
import { EmploymentStatus } from '../_components/employment-status';
import { EmployeeForm } from '../employee-form';
import { EmployeeActions } from './employee-actions';
import { EmployeeUserActions } from './employee-user-actions';

const t = terminology.employees;
const notSet = terminology.labels.notSet;

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('hr.employees.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/employees/${encodeURIComponent(id)}`, EmployeeResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const employee = result.data;
  const subtitle = employeeSubtitle(employee);
  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${employee.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const actions = (
    <>
      {history}
      {employee.canCreateUser ? <EmployeeUserActions employee={employee} /> : null}
      {employee.canManage ? <EmployeeActions employee={employee} /> : null}
    </>
  );
  const record = (
    <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionRecord}</h2>
      <KeyValueGrid
        items={[
          { label: t.infoEmployeeNo, value: employee.employeeNo },
          { label: t.infoEmployment, value: <EmploymentStatus status={employee.status} /> },
          {
            label: terminology.masters.columnStatus,
            value: <ActiveStatus isActive={employee.isActive} />,
          },
          { label: t.infoUser, value: userText(employee) },
          { label: terminology.masters.infoCreated, value: formatDateTime(employee.createdAt) },
          { label: terminology.masters.infoUpdated, value: formatDateTime(employee.updatedAt) },
        ]}
      />
    </section>
  );

  if (!employee.canManage) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={employee.fullName} subtitle={subtitle} actions={actions} />
        {record}
        <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
          <KeyValueGrid
            items={[
              { label: t.fieldCode, value: employee.code },
              { label: t.fieldName, value: employee.fullName },
              {
                label: t.fieldCompany,
                value: codeName(employee.company.code, employee.company.name),
              },
              { label: t.fieldDesignation, value: employee.designation?.name ?? notSet },
              { label: t.fieldWorkLocation, value: workLocationText(employee) },
              { label: t.fieldDateOfJoining, value: dateText(employee.dateOfJoining) },
              { label: t.fieldDateOfLeaving, value: dateText(employee.dateOfLeaving) },
              { label: t.fieldOfficialEmail, value: employee.officialEmail ?? notSet },
              { label: t.fieldMobile, value: employee.mobile ?? notSet },
            ]}
          />
        </section>
      </div>
    );
  }

  // canManage implies hr.employees.manage, which the form-options endpoint needs.
  const options = await apiGet('/api/employees/form-options', EmployeeFormOptionsResponse);

  if (options.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.editTitle} subtitle={subtitle} actions={actions} />
      {record}
      {/* Keyed on updatedAt so the form resets to the saved values after a save. */}
      <EmployeeForm key={employee.updatedAt} employee={employee} options={options.data} />
    </div>
  );
}
