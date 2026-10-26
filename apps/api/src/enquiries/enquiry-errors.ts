import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import type { EnquiryLineProblem } from './enquiry-rules';

export function invalidEnquiryStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
}

export function enquiryLineError(problem: EnquiryLineProblem): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, problem.code, problem.message);
}

export function invalidVendors(codes: readonly string[]): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_VENDOR',
    `Only approved, active vendors can receive an enquiry: ${codes.join(', ')}`,
  );
}

export function invalidEnquiryDate(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_DATE', message);
}
