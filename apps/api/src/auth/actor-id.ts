import type { Request } from 'express';

/** Id of the signed-in user; AuthGuard always attaches the session before a controller runs. */
export function actorIdOf(request: Request): string {
  if (request.auth === undefined) {
    throw new Error('AuthGuard did not attach the session');
  }

  return request.auth.user.id;
}
