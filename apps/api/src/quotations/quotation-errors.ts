import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

export function invalidQuotationStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
}

export function invalidQuotationEnquiry(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_ENQUIRY', message);
}

export function invalidQuotationVendor(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_VENDOR', message);
}

export function duplicateQuotation(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_QUOTATION', message);
}

export function invalidQuotationLines(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_LINES', message);
}

export function invalidQuotationDate(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_DATE', message);
}
