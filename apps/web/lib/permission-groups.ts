import { ALL_PERMISSIONS, type Permission } from '@uie/contracts';
import { navigation, type NavigationLabelKey } from '../config/navigation';

export interface PermissionRow {
  /** Terminology key under `nav` for the screen name. */
  labelKey: NavigationLabelKey;
  view: Permission | null;
  manage: Permission | null;
}

export interface PermissionGroup {
  /** Terminology key under `nav` for the menu group name. */
  labelKey: NavigationLabelKey;
  rows: PermissionRow[];
}

const KNOWN = new Set<string>(ALL_PERMISSIONS);

function findPermission(code: string): Permission | null {
  return KNOWN.has(code) ? (code as Permission) : null;
}

/**
 * Permissions grouped by menu group and screen, derived from the navigation config:
 * `<screen>.view` is the visibility permission, `<screen>.manage` (when it exists) the edit one.
 */
export function buildPermissionGroups(): PermissionGroup[] {
  return navigation.map((group) => ({
    labelKey: group.labelKey,
    rows: group.items.map((item) => {
      const view = item.permission === undefined ? null : findPermission(item.permission);
      const base = item.permission?.replace(/\.view$/, '');

      return {
        labelKey: item.labelKey,
        view,
        manage: base === undefined ? null : findPermission(`${base}.manage`),
      };
    }),
  }));
}
