import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AuditEventListQuery,
  type AuditEventDetail,
  type PagedAuditEventsResponse,
} from '@uie/contracts';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditQueryService } from './audit-query.service';

/** Read-only: the audit trail has no write endpoints. */
@Controller('audit-events')
export class AuditController {
  constructor(private readonly events: AuditQueryService) {}

  @Get()
  @RequirePermissions('administration.auditLog.view')
  list(
    @Query(new ZodValidationPipe(AuditEventListQuery)) query: AuditEventListQuery,
  ): Promise<PagedAuditEventsResponse> {
    return this.events.list(query);
  }

  @Get(':id')
  @RequirePermissions('administration.auditLog.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AuditEventDetail> {
    return this.events.get(id);
  }
}
