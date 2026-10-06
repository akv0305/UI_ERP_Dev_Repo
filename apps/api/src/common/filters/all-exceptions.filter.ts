import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  type LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JsonLogger } from '../logging/json-logger';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const HTTP_STATUS_NAMES = HttpStatus as unknown as Record<number, string>;

function statusToCode(status: number): string {
  return HTTP_STATUS_NAMES[status] ?? 'INTERNAL_SERVER_ERROR';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService = new JsonLogger()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = statusToCode(status);
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse !== null && typeof exceptionResponse === 'object') {
        const payload = exceptionResponse as Record<string, unknown>;
        const payloadMessage = payload.message;

        if (typeof payloadMessage === 'string') {
          message = payloadMessage;
        } else if (Array.isArray(payloadMessage)) {
          message = payloadMessage.map((item) => String(item)).join(', ');
        }

        if (typeof payload.code === 'string') {
          code = payload.code;
        }

        details = payload;
      }
    }

    this.logger.error(
      `${request.method} ${request.originalUrl} -> ${status} ${code}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );

    if (request.requestId) {
      response.setHeader(REQUEST_ID_HEADER, request.requestId);
    }

    const body: ErrorResponseBody = {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    };

    response.status(status).json(body);
  }
}
