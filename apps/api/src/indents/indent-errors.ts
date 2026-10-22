import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

export function invalidIndentStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
}

/** The creator and the submitter never approve or reject their own indent (PD-046). */
export function indentSelfApproval(): ApiError {
  return new ApiError(
    HttpStatus.FORBIDDEN,
    'SELF_APPROVAL_NOT_ALLOWED',
    'You raised or submitted this indent, so another approver must approve or reject it',
  );
}

export function invalidProject(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_PROJECT',
    'The project or its company is not active',
  );
}

export function invalidSite(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_SITE',
    'Choose an active site of the selected project',
  );
}

export function invalidStore(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_STORE',
    'Choose an active store of the selected site',
  );
}

export function invalidItems(codes: readonly string[]): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_ITEM',
    `Only approved, active items can be indented: ${codes.join(', ')}`,
  );
}

export function invalidQuantity(lineNo: number, decimalPlaces: number): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_QUANTITY',
    `Line ${lineNo}: the unit allows ${decimalPlaces} decimal place(s)`,
  );
}

export function invalidApprovedQuantity(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_APPROVED_QUANTITY', message);
}

export function invalidDate(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_DATE', message);
}
