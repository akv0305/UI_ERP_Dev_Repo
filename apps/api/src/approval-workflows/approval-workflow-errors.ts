import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

export function invalidApprovalRole(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_ROLE', message);
}

export function invalidApprovalCompany(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_COMPANY', message);
}

/** Two saves at once for the same document type + company: the later one hits a unique index. */
export function approvalWorkflowChanged(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'WORKFLOW_CHANGED',
    'This approval workflow was changed by someone else. Reload and try again.',
  );
}
