import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PlansService } from './plans.service.js';

@Injectable()
export class PlanSeedService implements OnApplicationBootstrap {
  constructor(private readonly plansService: PlansService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    await this.plansService.seedDefaultPlans();
  }
}
