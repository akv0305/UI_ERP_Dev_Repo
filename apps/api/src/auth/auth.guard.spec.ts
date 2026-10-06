import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/errors/api-error';
import { AllowDuringPasswordChange, Public, RequirePermissions } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import type { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';
import { PermissionsGuard } from './permissions.guard';

class Routes {
  @Public()
  open(): void {}

  protectedRoute(): void {}

  @AllowDuringPasswordChange()
  me(): void {}

  @RequirePermissions('administration.users.manage')
  manage(): void {}
}

function createContext(handler: keyof Routes, request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function authContext(mustChangePassword = false, permissions: string[] = []): AuthContext {
  return {
    sessionId: 's1',
    user: { id: 'u1', mustChangePassword, permissions },
    permissions: new Set(permissions),
  } as unknown as AuthContext;
}

describe('AuthGuard', () => {
  const resolveSession = jest.fn();
  const guard = new AuthGuard(new Reflector(), { resolveSession } as unknown as AuthService);

  beforeEach(() => resolveSession.mockReset());

  it('lets @Public routes through without looking up a session', async () => {
    await expect(guard.canActivate(createContext('open', {}))).resolves.toBe(true);
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it('rejects protected routes without a valid session with UNAUTHORIZED', async () => {
    resolveSession.mockResolvedValue(null);
    const request = { cookies: { uie_session: 'bad' } };

    await expect(guard.canActivate(createContext('protectedRoute', request))).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: 'UNAUTHORIZED' }) as unknown,
      },
    );
    expect(resolveSession).toHaveBeenCalledWith('bad');
  });

  it('attaches the session for protected routes', async () => {
    const auth = authContext();
    resolveSession.mockResolvedValue(auth);
    const request: Record<string, unknown> = { cookies: { uie_session: 'good' } };

    await expect(guard.canActivate(createContext('protectedRoute', request))).resolves.toBe(true);
    expect(request.auth).toBe(auth);
  });

  it('blocks other routes while a password change is required, but not the allowed ones', async () => {
    resolveSession.mockResolvedValue(authContext(true));
    const request = { cookies: { uie_session: 't' } };

    await expect(guard.canActivate(createContext('protectedRoute', request))).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }) as unknown,
      },
    );
    await expect(guard.canActivate(createContext('me', request))).resolves.toBe(true);
  });
});

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('allows routes without required permissions', () => {
    expect(guard.canActivate(createContext('protectedRoute', {}))).toBe(true);
  });

  it('throws 403 FORBIDDEN when a required permission is missing', () => {
    const request = { auth: authContext(false, ['administration.users.view']) };
    let thrown: unknown;

    try {
      guard.canActivate(createContext('manage', request));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).getStatus()).toBe(403);
    expect((thrown as ApiError).getResponse()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows the route when the permission is held', () => {
    const request = { auth: authContext(false, ['administration.users.manage']) };

    expect(guard.canActivate(createContext('manage', request))).toBe(true);
  });
});
