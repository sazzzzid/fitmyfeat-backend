import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommunicationsService } from './communications.service.js';

@Injectable()
export class ReminderScheduler {
  constructor(private readonly communications: CommunicationsService) {}

  @Cron('0 0 * * *', { timeZone: 'UTC' })
  runDaily(): Promise<void> {
    return this.communications.runForActiveGyms();
  }
}
