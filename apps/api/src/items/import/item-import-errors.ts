import { HttpStatus } from '@nestjs/common';
import { ITEM_IMPORT_MAX_ROWS } from '@uie/contracts';
import { ApiError } from '../../common/errors/api-error';

export function importFileRequired(): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'IMPORT_FILE_REQUIRED', 'Choose an .xlsx file');
}

export function importFileInvalid(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'IMPORT_FILE_INVALID',
    'The file could not be read. Save it as an Excel workbook (.xlsx) and try again',
  );
}

export function importHeaderNotFound(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'IMPORT_HEADER_NOT_FOUND',
    'No sheet has a header row with Description, Unit and Group columns in its first 10 rows',
  );
}

export function importNoRows(): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'IMPORT_NO_ROWS', 'The sheet has no item rows');
}

export function importTooManyRows(): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'IMPORT_TOO_MANY_ROWS',
    `The file has more than ${ITEM_IMPORT_MAX_ROWS} item rows. Split it into smaller files`,
  );
}
