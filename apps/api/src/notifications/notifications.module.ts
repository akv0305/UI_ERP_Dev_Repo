import { Module } from '@nestjs/common';
import { ApprovalInboxService } from './approval-inbox.service';
import { ApprovalInboxController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, ApprovalInboxController],
  providers: [NotificationsService, ApprovalInboxService],
})
export class NotificationsModule {}
