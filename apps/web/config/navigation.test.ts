import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  findNavigationTrail,
  getVisibleGroups,
  HOME_ITEM,
  navigation,
} from './navigation';

describe('navigation', () => {
  it('has a unique href for every item', () => {
    const hrefs = [
      HOME_ITEM.href,
      ...navigation.flatMap((group) => group.items.map((i) => i.href)),
    ];

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('lists each permission code once and uses them on the items', () => {
    const known = new Set<string>(ALL_PERMISSIONS);

    expect(known.size).toBe(ALL_PERMISSIONS.length);

    for (const group of navigation) {
      for (const item of group.items) {
        expect(item.permission).toBeDefined();

        if (item.permission !== undefined) {
          expect(known.has(item.permission)).toBe(true);
        }
      }
    }
  });

  it('shows only permitted items and drops groups left empty', () => {
    const groups = getVisibleGroups(['planning.wbs.view']);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.labelKey).toBe('planning');
    expect(groups[0]?.items).toHaveLength(1);
  });

  it('hides every permissioned item when no permissions are held', () => {
    expect(getVisibleGroups([])).toHaveLength(0);
  });
});

describe('findNavigationTrail', () => {
  it('returns the home item for /home', () => {
    expect(findNavigationTrail('/home')).toEqual([{ labelKey: 'home', href: '/home' }]);
  });

  it('returns the group and item for a menu route', () => {
    expect(findNavigationTrail('/purchase/indents')).toEqual([
      { labelKey: 'purchase' },
      { labelKey: 'indents', href: '/purchase/indents' },
    ]);
  });

  it('returns nothing for an unknown route', () => {
    expect(findNavigationTrail('/does-not-exist')).toEqual([]);
  });
});
