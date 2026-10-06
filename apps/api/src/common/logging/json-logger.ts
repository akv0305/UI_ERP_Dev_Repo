import { Injectable, type LoggerService } from '@nestjs/common';

@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private write(level: string, message: unknown, optionalParams: unknown[]): void {
    const lastParam = optionalParams.at(-1);
    const context = typeof lastParam === 'string' ? lastParam : 'Application';
    const trace = optionalParams.find(
      (param): param is string => typeof param === 'string' && param.includes('\n'),
    );

    const entry = {
      level,
      time: new Date().toISOString(),
      context,
      msg: typeof message === 'string' ? message : JSON.stringify(message),
      ...(trace ? { trace } : {}),
    };

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
