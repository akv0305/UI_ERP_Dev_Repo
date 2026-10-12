import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

/** True for a Prisma unique-constraint violation (P2002), which a concurrent insert can still raise. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

export function notFound(entity: string): ApiError {
  return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} not found`);
}

export function duplicateCode(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_CODE', 'This code is already in use');
}

export function codeImmutable(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'CODE_IMMUTABLE', 'The code cannot be changed');
}

/** Codes are stored upper-case, so a case-insensitive comparison is a plain comparison. */
export function assertCodeUnchanged(requested: string | undefined, current: string): void {
  if (requested !== undefined && requested.toUpperCase() !== current.toUpperCase()) {
    throw codeImmutable();
  }
}

/** 'YYYY-MM-DD' -> Date at UTC midnight (for @db.Date columns). */
export function toDateOnly(isoDate: string | null): Date | null {
  return isoDate === null ? null : new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDateOnly(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

export function sameSnapshot(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pageOf<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
): { items: T[]; total: number; page: number; pageSize: number } {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
