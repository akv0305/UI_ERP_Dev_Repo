import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

export function invalidComparisonStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
}

export function invalidComparisonEnquiry(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_ENQUIRY', message);
}

export function duplicateComparison(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_COMPARISON', message);
}

export function invalidComparisonDate(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_DATE', message);
}

/** INVALID_LINES, INVALID_SELECTION, REASON_REQUIRED or NOTHING_SELECTED. */
export function comparisonSelectionError(code: string, message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, code, message);
}
