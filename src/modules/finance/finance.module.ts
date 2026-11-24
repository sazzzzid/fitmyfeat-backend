import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module.js';
import { FinanceService } from './finance.service.js';
import { GymFinanceController } from './gym-finance.controller.js';
import { PlatformFinanceController } from './platform-finance.controller.js';

@Module({
  imports: [GymsModule],
  controllers: [PlatformFinanceController, GymFinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
