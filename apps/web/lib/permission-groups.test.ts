import { ALL_PERMISSIONS } from '@uie/contracts';
import { describe, expect, it } from 'vitest';
import { buildPermissionGroups } from './permission-groups';

describe('buildPermissionGroups', () => {
  const groups = buildPermissionGroups();

  it('lists every permission code exactly once', () => {
    const listed = groups.flatMap((group) =>
      group.rows.flatMap((row) =>
        [row.view, row.manage, row.approve].filter((code) => code !== null),
      ),
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
      approve: null,
    });
  });

  it('adds approve for screens that have one', () => {
    const masters = groups.find((group) => group.labelKey === 'masters');
    const items = masters?.rows.find((row) => row.labelKey === 'items');

    expect(items).toEqual({
      labelKey: 'items',
      view: 'masters.items.view',
      manage: 'masters.items.manage',
      approve: 'masters.items.approve',
    });
  });

  it('adds manage and approve for indents', () => {
    const purchase = groups.find((group) => group.labelKey === 'purchase');
    const indents = purchase?.rows.find((row) => row.labelKey === 'indents');

    expect(indents).toEqual({
      labelKey: 'indents',
      view: 'purchase.indents.view',
      manage: 'purchase.indents.manage',
      approve: 'purchase.indents.approve',
    });
  });

  it('adds manage only for enquiries', () => {
    const purchase = groups.find((group) => group.labelKey === 'purchase');
    const enquiries = purchase?.rows.find((row) => row.labelKey === 'enquiries');

    expect(enquiries).toEqual({
      labelKey: 'enquiries',
      view: 'purchase.enquiries.view',
      manage: 'purchase.enquiries.manage',
      approve: null,
    });
  });

  it('leaves manage and approve empty for screens without them', () => {
    const purchase = groups.find((group) => group.labelKey === 'purchase');
    const quotations = purchase?.rows.find((row) => row.labelKey === 'quotations');

    expect(quotations).toEqual({
      labelKey: 'quotations',
      view: 'purchase.quotations.view',
      manage: null,
      approve: null,
    });
  });
});
