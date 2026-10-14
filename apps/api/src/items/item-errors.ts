import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { duplicateCode, isUniqueViolation } from '../masters/master-helpers';

export function duplicateName(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_NAME', 'This name is already in use');
}

/** A concurrent insert can still hit a unique index: name indexes map to DUPLICATE_NAME. */
export function uniqueConflictOf(error: unknown): ApiError | null {
  if (!isUniqueViolation(error)) {
    return null;
  }

  const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});

  return /name_lower_key|"name"/.test(detail) ? duplicateName() : duplicateCode();
}

export async function guardUnique<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw uniqueConflictOf(error) ?? error;
  }
}
