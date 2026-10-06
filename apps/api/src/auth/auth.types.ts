import type { MeResponse, Permission } from '@uie/contracts';

export type AuthenticatedUser = MeResponse;

export interface AuthContext {
  sessionId: string;
  user: AuthenticatedUser;
  permissions: ReadonlySet<Permission>;
}
