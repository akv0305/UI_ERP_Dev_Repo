import type { MeResponse, Permission } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';

export type AuthenticatedUser = MeResponse;

export interface AuthContext {
  sessionId: string;
  user: AuthenticatedUser;
  /** Menu permissions (union over active-role assignments); route guards use this. */
  permissions: ReadonlySet<Permission>;
  /** Scope-aware checks for this request, built from assignments read from the database for this request. */
  access: AccessContext;
}
