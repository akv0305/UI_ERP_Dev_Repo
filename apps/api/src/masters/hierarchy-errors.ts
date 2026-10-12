import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

/** Deactivation is blocked while the record still has active children. */
export function hasActiveChildren(children: string): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'HAS_ACTIVE_CHILDREN',
    `Deactivate the active ${children} first`,
  );
}

/** Creating or reactivating under an inactive parent is not allowed. */
export function parentInactive(parent: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'PARENT_INACTIVE', `The ${parent} is inactive`);
}

export function invalidGstRegistration(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_GST_REGISTRATION',
    'The billing GST registration must be an active registration of the same company',
  );
}
