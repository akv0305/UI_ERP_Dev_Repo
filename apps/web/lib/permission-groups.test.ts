import { ALL_PERMISSIONS } from '@uie/contracts';
import { describe, expect, it } from 'vitest';
import { buildPermissionGroups } from './permission-groups';

describe('buildPermissionGroups', () => {
  const groups = buildPermissionGroups();

  it('lists every permission code exactly once', () => {
    const listed = groups.flatMap((group) =>
      group.rows.flatMap((row) => [row.view, row.manage].filter((code) => code !== null)),
    );

    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('pairs view and manage permissions of the same screen', () => {
    const administration = groups.find((group) => group.labelKey === 'administration');
    const users = administration?.rows.find((row) => row.labelKey === 'users');

    expect(users).toEqual({
      labelKey: 'users',
      view: 'administration.users.view',
      manage: 'administration.users.manage',
    });
  });

  it('leaves manage empty for screens without one', () => {
    const purchase = groups.find((group) => group.labelKey === 'purchase');

    expect(purchase?.rows[0]?.manage).toBeNull();
  });
});
