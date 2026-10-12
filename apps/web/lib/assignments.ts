import type {
  RoleAssignmentInput,
  RoleAssignmentResponse,
  RoleOption,
  RoleScopeType,
  ScopeOptionsResponse,
} from '@uie/contracts';
import { terminology } from '@/config/terminology';
import type { SelectOption } from '@/lib/state-options';

/** One editable row of the assignments table. `targetId` is the company, project or site id (or ''). */
export interface AssignmentRow {
  key: string;
  roleId: string;
  scopeType: RoleScopeType;
  targetId: string;
}

export const SCOPE_TYPES: readonly RoleScopeType[] = ['GLOBAL', 'COMPANY', 'PROJECT', 'SITE'];

export function newAssignmentRow(key: string): AssignmentRow {
  return { key, roleId: '', scopeType: 'GLOBAL', targetId: '' };
}

/** ADMINISTRATOR and roles with administration permissions can only be given with GLOBAL scope. */
export function allowedScopeTypes(
  role: Pick<RoleOption, 'requiresGlobalScope'> | undefined,
): readonly RoleScopeType[] {
  return role?.requiresGlobalScope === true ? ['GLOBAL'] : SCOPE_TYPES;
}

/** Choosing a role keeps the scope when the role allows it, otherwise falls back to GLOBAL. */
export function changeRole(
  row: AssignmentRow,
  roleId: string,
  role: Pick<RoleOption, 'requiresGlobalScope'> | undefined,
): AssignmentRow {
  const allowed = allowedScopeTypes(role);

  return allowed.includes(row.scopeType)
    ? { ...row, roleId }
    : { ...row, roleId, scopeType: 'GLOBAL', targetId: '' };
}

/** Switching the scope type always clears the target: a company id is not a valid project id. */
export function changeScopeType(row: AssignmentRow, scopeType: RoleScopeType): AssignmentRow {
  return scopeType === row.scopeType ? row : { ...row, scopeType, targetId: '' };
}

/** Pick list for the target select of a row; GLOBAL has no target. Labels are "CODE — Name". */
export function targetOptionsFor(
  scopeType: RoleScopeType,
  options: ScopeOptionsResponse,
  extra: SelectOption[] = [],
): SelectOption[] {
  const source: SelectOption[] =
    scopeType === 'COMPANY'
      ? options.companies.map((item) => ({ value: item.id, label: item.label }))
      : scopeType === 'PROJECT'
        ? options.projects.map((item) => ({ value: item.id, label: item.label }))
        : scopeType === 'SITE'
          ? options.sites.map((item) => ({ value: item.id, label: item.label }))
          : [];

  // A target that was deactivated after it was assigned stays selectable so the row can be kept.
  return [...source, ...extra.filter((item) => !source.some((s) => s.value === item.value))];
}

export function isRowComplete(row: AssignmentRow): boolean {
  return row.roleId !== '' && (row.scopeType === 'GLOBAL' || row.targetId !== '');
}

export function allRowsComplete(rows: readonly AssignmentRow[]): boolean {
  return rows.every(isRowComplete);
}

/** The API shape: exactly the target field that matches the scope type is set. */
export function toAssignmentInputs(rows: readonly AssignmentRow[]): RoleAssignmentInput[] {
  return rows.map((row) => ({
    roleId: row.roleId,
    scopeType: row.scopeType,
    companyId: row.scopeType === 'COMPANY' ? row.targetId : null,
    projectId: row.scopeType === 'PROJECT' ? row.targetId : null,
    siteId: row.scopeType === 'SITE' ? row.targetId : null,
  }));
}

export function toAssignmentRows(assignments: readonly RoleAssignmentResponse[]): AssignmentRow[] {
  return assignments.map((assignment) => ({
    key: assignment.id,
    roleId: assignment.roleId,
    scopeType: assignment.scopeType,
    targetId: assignment.target?.id ?? '',
  }));
}

/** Inactive targets of existing assignments, offered so those rows can stay as they are. */
export function inactiveTargetOptions(
  assignments: readonly RoleAssignmentResponse[],
): SelectOption[] {
  return assignments.flatMap((assignment) =>
    assignment.target !== null && !assignment.target.isActive
      ? [
          {
            value: assignment.target.id,
            label: `${assignment.target.code} — ${assignment.target.name} (${terminology.users.inactiveTarget})`,
          },
        ]
      : [],
  );
}

/** "Project manager — Project: P001 — Metro", or "Clerk — All companies". */
export function describeAssignmentText(assignment: RoleAssignmentResponse): string {
  const scope = terminology.users.scopeTypes[assignment.scopeType];

  return assignment.target === null
    ? `${assignment.roleName} — ${scope}`
    : `${assignment.roleName} — ${scope}: ${assignment.target.code} — ${assignment.target.name}`;
}
