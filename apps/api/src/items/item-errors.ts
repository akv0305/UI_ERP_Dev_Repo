import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { duplicateCode, isUniqueViolation } from '../masters/master-helpers';

export function duplicateName(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_NAME', 'This name is already in use');
}

export function duplicateItem(existingCode: string): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_ITEM',
    `An item with the same description, size and unit already exists (${existingCode})`,
  );
}

export function invalidCategory(): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_CATEGORY', 'Choose an active category');
}

export function invalidUnit(): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_UNIT', 'Choose an active unit');
}

export function invalidStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
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
