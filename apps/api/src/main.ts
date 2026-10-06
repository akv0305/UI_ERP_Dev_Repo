import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JsonLogger } from './common/logging/json-logger';
import { createRequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap(): Promise<void> {
  const logger = new JsonLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });

  app.setGlobalPrefix('api');
  // The web app proxies /api through one hop; trust it so request.ip is the real client address.
  app.set('trust proxy', 1);
  app.use(createRequestIdMiddleware());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 3001;

  await app.listen(port);
  logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
