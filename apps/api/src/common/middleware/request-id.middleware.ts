import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : randomUUID();
}

export function createRequestIdMiddleware(): RequestHandler {
  return function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      process.stdout.write(
        `${JSON.stringify({
          level: 'info',
          time: new Date().toISOString(),
          context: 'Http',
          requestId,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          msg: 'request completed',
        })}\n`,
      );
    });

    next();
  };
}
