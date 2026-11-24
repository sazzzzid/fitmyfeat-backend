import { Module } from '@nestjs/common';
import { PlanSeedService } from './plan-seed.service.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlanSeedService],
  exports: [PlansService, PlanSeedService],
})
export class PlansModule {}
