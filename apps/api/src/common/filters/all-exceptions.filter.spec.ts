import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ArgumentsHost {
  const httpArgumentsHost = {
    getRequest: () => request,
    getResponse: () => response,
    getNext: () => undefined,
  };

  return {
    switchToHttp: () => httpArgumentsHost,
    getArgByIndex: () => undefined,
    getArgs: () => [],
    getType: () => 'http',
    switchToRpc: () => {
      throw new Error('not implemented');
    },
    switchToWs: () => {
      throw new Error('not implemented');
    },
  } as unknown as ArgumentsHost;
}

function createResponse() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };

  return response;
}

const silentLogger = {
  log: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
};

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter(silentLogger);

  it('returns the validation issues from a ZodValidationPipe failure as details', () => {
    const schema = z.object({ name: z.string().min(1) });
    const pipe = new ZodValidationPipe(schema);

    let caught: BadRequestException | undefined;
    try {
      pipe.transform({ name: '' }, { type: 'body' });
    } catch (error) {
      caught = error as BadRequestException;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const expectedDetails = (caught?.getResponse() as { details: unknown }).details;
    expect(Array.isArray(expectedDetails)).toBe(true);

    const response = createResponse();
    const request = { method: 'POST', originalUrl: '/api/widgets', requestId: 'req-1' };

    filter.catch(caught, createHost(request, response));

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expectedDetails,
      },
    });
    expect(response.headers['x-request-id']).toBe('req-1');
  });

  it('maps a plain HttpException without a details field to an error without details', () => {
    const exception = new NotFoundException('Widget not found');
    const response = createResponse();
    const request = { method: 'GET', originalUrl: '/api/widgets/1' };

    filter.catch(exception, createHost(request, response));

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Widget not found',
      },
    });
  });

  it('maps an unknown error to a generic internal server error', () => {
    const response = createResponse();
    const request = { method: 'GET', originalUrl: '/api/widgets' };

    filter.catch(new Error('boom'), createHost(request, response));

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  });
});
