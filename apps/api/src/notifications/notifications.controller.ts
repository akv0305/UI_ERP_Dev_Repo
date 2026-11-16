import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ADMINISTRATOR_ROLE_CODE,
  type ApprovalInboxResponse,
  type NotificationListResponse,
  type UnreadNotificationCountResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { isEffective } from '../access/access-context';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { ApprovalInboxService } from './approval-inbox.service';
import { NotificationsService } from './notifications.service';

/** The signed-in user's own notifications: session only, no permission. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() request: Request): Promise<NotificationListResponse> {
    return this.notifications.list(actorIdOf(request));
  }

  // Static routes before ':id'.
  @Get('unread-count')
  unreadCount(@Req() request: Request): Promise<UnreadNotificationCountResponse> {
    return this.notifications.unreadCount(actorIdOf(request));
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@Req() request: Request): Promise<void> {
    await this.notifications.markAllRead(actorIdOf(request));
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.notifications.markRead(id, actorIdOf(request));
  }
}

/** Authority comes from being the assigned approver (OQ-92, OQ-103); on-hold list for Administrators (OQ-118). */
@Controller('approvals')
export class ApprovalInboxController {
  constructor(private readonly inbox: ApprovalInboxService) {}

  @Get('awaiting-me')
  awaitingMe(@Req() request: Request): Promise<ApprovalInboxResponse> {
    const isAdministrator = accessOf(request).assignments.some(
      (assignment) => assignment.role.code === ADMINISTRATOR_ROLE_CODE && isEffective(assignment),
    );

    return this.inbox.inbox(actorIdOf(request), isAdministrator);
  }
}
