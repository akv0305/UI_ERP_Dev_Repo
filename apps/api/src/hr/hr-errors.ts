import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { isUniqueViolation } from '../masters/master-helpers';

export function duplicateEmployeeCode(existingNo?: string): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_EMPLOYEE_CODE',
    existingNo === undefined
      ? 'This employee code is already in use'
      : `This employee code is already in use (${existingNo})`,
  );
}

export function duplicateEmail(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'DUPLICATE_EMAIL',
    'This official email is already used by another employee',
  );
}

export function invalidCompany(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_COMPANY',
    'Choose an active company you manage',
  );
}

export function invalidDesignation(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_DESIGNATION',
    'Choose an active designation',
  );
}

export function invalidWorkLocation(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_WORK_LOCATION',
    'Work location: Head Office, or an active project of the same company with an optional site of that project',
  );
}

export function invalidEmailDomain(domain: string): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_EMAIL_DOMAIN',
    `The official email must end with @${domain}`,
  );
}

export function invalidDates(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_DATES',
    'The leaving date cannot be before the joining date',
  );
}

export function codeChangeRemarksRequired(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'CODE_CHANGE_REMARKS_REQUIRED',
    'Give a reason for changing the employee code',
  );
}

export function employeeNotActive(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'EMPLOYEE_NOT_ACTIVE',
    'Only an active employee who has not left can get a sign-in user',
  );
}

export function userAlreadyLinked(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'USER_ALREADY_LINKED',
    'This employee or this user is already linked',
  );
}

export function invalidUser(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_USER',
    'Choose an active user who is not an administrator',
  );
}

export function usernameTaken(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'USERNAME_TAKEN',
    'Another user already has this employee code as username',
  );
}

export function userEmailTaken(): ApiError {
  return new ApiError(
    HttpStatus.CONFLICT,
    'USER_EMAIL_TAKEN',
    'Another user already has this email',
  );
}

/** Unique index hit while writing the user or the link: link -> USER_ALREADY_LINKED, email, else username. */
export async function guardUserUnique<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});

    if (/userId/i.test(detail)) {
      throw userAlreadyLinked();
    }

    throw /email/i.test(detail) ? userEmailTaken() : usernameTaken();
  }
}

/** A concurrent save can still hit a unique index: email index -> DUPLICATE_EMAIL, else the code. */
export async function guardEmployeeUnique<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});

    throw /email/i.test(detail) ? duplicateEmail() : duplicateEmployeeCode();
  }
}
