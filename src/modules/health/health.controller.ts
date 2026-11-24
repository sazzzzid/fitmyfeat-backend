import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.healthService.getHello();
  }
}
