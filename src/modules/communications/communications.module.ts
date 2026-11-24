import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GymsModule } from '../gyms/gyms.module.js';
import { CommunicationsService } from './communications.service.js';
import { GymCommunicationsController } from './gym-communications.controller.js';
import { MessageTemplatesController } from './message-templates.controller.js';
import { ReminderScheduler } from './reminder.scheduler.js';

@Module({
  imports: [GymsModule, ScheduleModule.forRoot()],
  controllers: [MessageTemplatesController, GymCommunicationsController],
  providers: [CommunicationsService, ReminderScheduler],
})
export class CommunicationsModule {}
