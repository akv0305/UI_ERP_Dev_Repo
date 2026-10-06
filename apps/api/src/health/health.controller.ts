import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthResponse } from '@uie/contracts';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getHealth(): HealthResponse {
    return HealthResponse.parse({
      status: 'ok',
      service: 'uie-api',
      version: this.configService.get<string>('APP_VERSION') ?? '0.0.0',
      time: new Date().toISOString(),
    });
  }
}
