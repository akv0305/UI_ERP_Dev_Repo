import { jest } from '@jest/globals';
import { ApiError } from '../common/errors/api-error';

export interface Write {
  table: string;
  data: unknown;
}

/**
 * Collects writes made through a transaction client and keeps them only when the transaction
 * callback resolves, as a real database would. Used by master-data service specs.
 */
export class TransactionRecorder {
  readonly committed: Write[] = [];
  private pending: Write[] = [];

  /** A write method on the transaction client; resolves with `result()` (or undefined). */
  write(table: string, result?: (arg: unknown) => unknown) {
    return jest.fn(async (arg: unknown) => {
      this.pending.push({ table, data: arg });

      return result?.(arg);
    });
  }

  /** Implementation for `prisma.$transaction(callback)`. */
  run<TTx>(tx: TTx) {
    return async (callback: (client: TTx) => Promise<unknown>) => {
      this.pending = [];
      const result = await callback(tx);
      this.committed.push(...this.pending);

      return result;
    };
  }

  tables(): string[] {
    return this.committed.map((entry) => entry.table);
  }

  audit(): Record<string, unknown>[] {
    return this.committed
      .filter((entry) => entry.table === 'auditEvent.create')
      .map((entry) => (entry.data as { data: Record<string, unknown> }).data);
  }
}

export async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);

    return ((error as ApiError).getResponse() as { code: string }).code;
  }

  return undefined;
}
