import type { AuthContext } from '../auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
    }
  }
}
