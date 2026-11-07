import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import type { RouteProblemCode } from './approval-route';

export const NO_APPROVAL_WORKFLOW_MESSAGE =
  'No approval matrix is set up for purchase orders. Ask the administrator.';

/** OQ-115 */
export function noApprovalWorkflow(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'NO_APPROVAL_WORKFLOW', NO_APPROVAL_WORKFLOW_MESSAGE);
}

/** NO_APPROVER = nobody can approve a level (OQ-104); the other two = pick needed or not allowed (PD-054). */
export function routeError(code: RouteProblemCode, message: string): ApiError {
  return new ApiError(
    code === 'NO_APPROVER' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
    code,
    message,
  );
}

export function notYourStep(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'NOT_YOUR_STEP',
    'This purchase order is not waiting for your approval.',
  );
}
