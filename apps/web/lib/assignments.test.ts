import type { RoleAssignmentResponse, RoleOption, ScopeOptionsResponse } from '@uie/contracts';
import { describe, expect, it } from 'vitest';
import {
  allRowsComplete,
  allowedScopeTypes,
  changeRole,
  changeScopeType,
  describeAssignmentText,
  inactiveTargetOptions,
  isRowComplete,
  newAssignmentRow,
  targetOptionsFor,
  toAssignmentInputs,
  toAssignmentRows,
} from './assignments';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const scopeOptions: ScopeOptionsResponse = {
  companies: [{ id: ID(1), label: 'UIE — Unique Infra' }],
  projects: [{ id: ID(2), label: 'P001 — Metro', companyId: ID(1) }],
  sites: [{ id: ID(3), label: 'S01 — Yard', projectId: ID(2) }],
};

const globalOnly: Pick<RoleOption, 'requiresGlobalScope'> = { requiresGlobalScope: true };
const anyScope: Pick<RoleOption, 'requiresGlobalScope'> = { requiresGlobalScope: false };

describe('scope switching in the assignment editor', () => {
  it('a new row starts as GLOBAL with no role and no target', () => {
    expect(newAssignmentRow('k1')).toEqual({
      key: 'k1',
      roleId: '',
      scopeType: 'GLOBAL',
      targetId: '',
    });
  });

  it('switching the scope type clears the target (a company id is not a project id)', () => {
    const row = { key: 'k', roleId: 'r', scopeType: 'COMPANY' as const, targetId: ID(1) };

    expect(changeScopeType(row, 'PROJECT')).toEqual({ ...row, scopeType: 'PROJECT', targetId: '' });
    expect(changeScopeType(row, 'GLOBAL')).toEqual({ ...row, scopeType: 'GLOBAL', targetId: '' });
  });

  it('keeping the same scope type keeps the target', () => {
    const row = { key: 'k', roleId: 'r', scopeType: 'SITE' as const, targetId: ID(3) };

    expect(changeScopeType(row, 'SITE')).toBe(row);
  });

  it('offers companies for COMPANY, projects for PROJECT, sites for SITE and nothing for GLOBAL', () => {
    expect(targetOptionsFor('COMPANY', scopeOptions)).toEqual([
      { value: ID(1), label: 'UIE — Unique Infra' },
    ]);
    expect(targetOptionsFor('PROJECT', scopeOptions)).toEqual([
      { value: ID(2), label: 'P001 — Metro' },
    ]);
    expect(targetOptionsFor('SITE', scopeOptions)).toEqual([{ value: ID(3), label: 'S01 — Yard' }]);
    expect(targetOptionsFor('GLOBAL', scopeOptions)).toEqual([]);
  });

  it('keeps an inactive target of an existing row selectable, once', () => {
    const extra = [{ value: ID(9), label: 'OLD — Closed (inactive)' }];

    expect(targetOptionsFor('COMPANY', scopeOptions, extra)).toEqual([
      { value: ID(1), label: 'UIE — Unique Infra' },
      ...extra,
    ]);
    expect(
      targetOptionsFor('COMPANY', scopeOptions, [{ value: ID(1), label: 'duplicate' }]),
    ).toHaveLength(1);
  });

  it('a global-only role allows only the GLOBAL scope; other roles allow all four', () => {
    expect(allowedScopeTypes(globalOnly)).toEqual(['GLOBAL']);
    expect(allowedScopeTypes(anyScope)).toEqual(['GLOBAL', 'COMPANY', 'PROJECT', 'SITE']);
    expect(allowedScopeTypes(undefined)).toHaveLength(4);
  });

  it('choosing a global-only role on a scoped row forces GLOBAL and clears the target', () => {
    const row = { key: 'k', roleId: '', scopeType: 'PROJECT' as const, targetId: ID(2) };

    expect(changeRole(row, 'admin', globalOnly)).toEqual({
      key: 'k',
      roleId: 'admin',
      scopeType: 'GLOBAL',
      targetId: '',
    });
  });

  it('choosing an ordinary role keeps the scope and the target', () => {
    const row = { key: 'k', roleId: '', scopeType: 'PROJECT' as const, targetId: ID(2) };

    expect(changeRole(row, 'pm', anyScope)).toEqual({ ...row, roleId: 'pm' });
  });
});

describe('completeness and the API payload', () => {
  it('a row needs a role, and a target unless it is GLOBAL', () => {
    expect(isRowComplete({ key: 'k', roleId: '', scopeType: 'GLOBAL', targetId: '' })).toBe(false);
    expect(isRowComplete({ key: 'k', roleId: 'r', scopeType: 'GLOBAL', targetId: '' })).toBe(true);
    expect(isRowComplete({ key: 'k', roleId: 'r', scopeType: 'COMPANY', targetId: '' })).toBe(
      false,
    );
    expect(isRowComplete({ key: 'k', roleId: 'r', scopeType: 'SITE', targetId: ID(3) })).toBe(true);
    expect(allRowsComplete([])).toBe(true);
  });

  it('sets exactly the target field that matches the scope type', () => {
    const rows = [
      { key: '1', roleId: 'a', scopeType: 'GLOBAL' as const, targetId: '' },
      { key: '2', roleId: 'b', scopeType: 'COMPANY' as const, targetId: ID(1) },
      { key: '3', roleId: 'c', scopeType: 'PROJECT' as const, targetId: ID(2) },
      { key: '4', roleId: 'd', scopeType: 'SITE' as const, targetId: ID(3) },
    ];

    expect(toAssignmentInputs(rows)).toEqual([
      { roleId: 'a', scopeType: 'GLOBAL', companyId: null, projectId: null, siteId: null },
      { roleId: 'b', scopeType: 'COMPANY', companyId: ID(1), projectId: null, siteId: null },
      { roleId: 'c', scopeType: 'PROJECT', companyId: null, projectId: ID(2), siteId: null },
      { roleId: 'd', scopeType: 'SITE', companyId: null, projectId: null, siteId: ID(3) },
    ]);
  });
});

describe('existing assignments', () => {
  const assignments: RoleAssignmentResponse[] = [
    {
      id: ID(10),
      roleId: ID(20),
      roleCode: 'PM',
      roleName: 'Project manager',
      scopeType: 'PROJECT',
      target: { id: ID(2), code: 'P001', name: 'Metro', isActive: false },
    },
    {
      id: ID(11),
      roleId: ID(21),
      roleCode: 'CLERK',
      roleName: 'Clerk',
      scopeType: 'GLOBAL',
      target: null,
    },
  ];

  it('become rows keyed by the assignment id', () => {
    expect(toAssignmentRows(assignments)).toEqual([
      { key: ID(10), roleId: ID(20), scopeType: 'PROJECT', targetId: ID(2) },
      { key: ID(11), roleId: ID(21), scopeType: 'GLOBAL', targetId: '' },
    ]);
  });

  it('offer only the inactive targets as extra options', () => {
    expect(inactiveTargetOptions(assignments)).toEqual([
      { value: ID(2), label: 'P001 — Metro (inactive)' },
    ]);
  });

  it('read as "Role — Scope: CODE — Name"', () => {
    expect(describeAssignmentText(assignments[0] as RoleAssignmentResponse)).toBe(
      'Project manager — Project: P001 — Metro',
    );
    expect(describeAssignmentText(assignments[1] as RoleAssignmentResponse)).toBe(
      'Clerk — All companies',
    );
  });
});
