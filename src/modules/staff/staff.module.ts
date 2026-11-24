import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { RoleTemplatesController } from './role-templates.controller.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [GymsModule, SubscriptionsModule],
  controllers: [StaffController, RoleTemplatesController, AuditLogController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
