import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { ActivityQueryDto } from './dto/activity-query.dto.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('activity')
  @RequirePermission('view_dashboard')
  activity(@Query() query: ActivityQueryDto) {
    return this.dashboardService.activity(query.from, query.to);
  }

  @Get()
  @RequirePermission('view_dashboard')
  getStats() {
    return this.dashboardService.getStats();
  }
}
