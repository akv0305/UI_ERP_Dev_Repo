import type { Request } from 'express';
import type { AccessContext } from '../access/access-context';

/** Id of the signed-in user; AuthGuard always attaches the session before a controller runs. */
export function actorIdOf(request: Request): string {
  if (request.auth === undefined) {
    throw new Error('AuthGuard did not attach the session');
  }

  return request.auth.user.id;
}

/** Scope-aware access of the signed-in user for this request. */
export function accessOf(request: Request): AccessContext {
  if (request.auth === undefined) {
    throw new Error('AuthGuard did not attach the session');
  }

  return request.auth.access;
}
