import type { EmployeeResponse } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { messageForApiError } from '@/lib/api/client';
import { formatDate } from '@/lib/format';

const t = terminology.employees;
const notSet = terminology.labels.notSet;

export function codeName(code: string, name: string): string {
  return `${code} ${name}`;
}

export function employeeSubtitle(employee: Pick<EmployeeResponse, 'employeeNo' | 'code'>): string {
  return `${employee.employeeNo}${t.titleSeparator}${employee.code}`;
}

/** Blank, Head office, or Project [/ Site] (OQ-138). */
export function workLocationText(
  employee: Pick<EmployeeResponse, 'workLocationType' | 'project' | 'site'>,
): string {
  const { workLocationType, project, site } = employee;

  if (workLocationType === null) {
    return notSet;
  }

  if (workLocationType === 'HEAD_OFFICE' || project === null) {
    return t.workLocations[workLocationType];
  }

  const projectText = codeName(project.code, project.name);

  return site === null
    ? projectText
    : `${projectText}${t.locationSeparator}${codeName(site.code, site.name)}`;
}

export function userText(employee: Pick<EmployeeResponse, 'user'>): string {
  const { user } = employee;

  if (user === null) {
    return t.userNotLinked;
  }

  return user.isActive ? user.username : `${user.username} ${t.inactiveSuffix}`;
}

export function dateText(value: string | null): string {
  return value === null ? notSet : formatDate(value);
}

/** Employee-specific message first, then the shared API error messages. */
export function employeeErrorMessage(code: string | undefined): string {
  const own = t.apiErrors as Record<string, string>;

  return (code !== undefined ? own[code] : undefined) ?? messageForApiError(code);
}
