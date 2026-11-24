import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Module({
  imports: [GymsModule, FinanceModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
