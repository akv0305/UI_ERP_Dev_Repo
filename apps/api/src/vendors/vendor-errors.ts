import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { duplicateCode, isUniqueViolation } from '../masters/master-helpers';

function existing(code?: string): string {
  return code === undefined ? '' : ` (${code})`;
}

export function duplicatePan(existingCode?: string): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_PAN',
    `Another vendor already has this PAN${existing(existingCode)}`,
  );
}

export function duplicateUdyam(existingCode?: string): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_UDYAM',
    `Another vendor already has this Udyam number${existing(existingCode)}`,
  );
}

export function invalidVendorStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
}

/** Maker-checker for vendors (OQ-35 b): the submitter cannot approve or reject (OQ-36). */
export function selfApprovalNotAllowed(): ApiError {
  return new ApiError(
    HttpStatus.FORBIDDEN,
    'SELF_APPROVAL_NOT_ALLOWED',
    'You submitted this vendor, so another approver must approve or reject it',
  );
}

export function vendorPanMismatch(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'GSTIN_PAN_MISMATCH',
    'The PAN does not match the vendor GST registrations',
  );
}

/** A concurrent insert can still hit a unique index (vendors_pan_key, vendors_udyam_key, code). */
export function vendorUniqueConflictOf(error: unknown): ApiError | null {
  if (!isUniqueViolation(error)) {
    return null;
  }

  const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});

  if (/udyam/i.test(detail)) {
    return duplicateUdyam();
  }

  return /pan/i.test(detail) ? duplicatePan() : duplicateCode();
}
export function invalidGstin(): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_GSTIN', 'The GSTIN is not valid');
}

export function gstinStateMismatch(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'GSTIN_STATE_MISMATCH',
    'The GSTIN does not belong to the selected state',
  );
}

export function gstinVendorPanMismatch(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'GSTIN_PAN_MISMATCH',
    'The GSTIN does not match the vendor PAN',
  );
}

export function duplicateVendorGstin(existingCode?: string): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_GSTIN',
    `This GSTIN is already registered for a vendor${existing(existingCode)}`,
  );
}

export function duplicateBankAccount(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_BANK_ACCOUNT',
    'This bank account is already added for the vendor',
  );
}

/** A concurrent insert can still hit a unique index (GSTIN, or vendor + IFSC + account number). */
export function vendorDetailConflictOf(error: unknown): ApiError | null {
  if (!isUniqueViolation(error)) {
    return null;
  }

  const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});

  if (/gstin/i.test(detail)) {
    return duplicateVendorGstin();
  }

  return /accountNumber|ifsc|bank_accounts/i.test(detail) ? duplicateBankAccount() : null;
}
