import { ALL_PERMISSIONS, type Permission } from '@uie/contracts';

const GRANT_ALL = '*';

export function getCurrentPermissions(): Permission[] {
  if (process.env.NODE_ENV === 'production') {
    return [];
  }

  const raw = process.env.DEV_GRANT_PERMISSIONS;

  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  if (raw.trim() === GRANT_ALL) {
    return [...ALL_PERMISSIONS];
  }

  const known = new Set<string>(ALL_PERMISSIONS);
  const requested = raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0);

  return requested.filter((code): code is Permission => known.has(code));
}
