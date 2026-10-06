import { HttpException, type HttpStatus } from '@nestjs/common';

/** HttpException carrying the `code` that AllExceptionsFilter puts in the error body. */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super({ code, message, ...(details === undefined ? {} : { details }) }, status);
  }
}
