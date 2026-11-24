import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ChargeFilterDto, FinanceRangeDto, SettlementDto } from './dto/index.js';
import { FinanceService } from './finance.service.js';

@Controller('platform-finance')
export class PlatformFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('payments')
  @RequirePermission('manage_platform_finance')
  payments(@Query() query: ChargeFilterDto) {
    return this.finance.listPayments(query.status, query);
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  @RequirePermission('manage_platform_finance')
  refund(@Param('id') id: string) {
    return this.finance.refund(id);
  }

  @Post('subscriptions/:id/fail')
  @HttpCode(200)
  @RequirePermission('manage_platform_finance')
  fail(@Param('id') id: string) {
    return this.finance.failSubscription(id);
  }

  @Get('settlements')
  @RequirePermission('manage_platform_finance')
  settlements() {
    return this.finance.listSettlements();
  }

  @Post('settlements')
  @HttpCode(201)
  @RequirePermission('manage_platform_finance')
  settle(@CurrentUser() user: AuthenticatedUser, @Body() dto: SettlementDto) {
    return this.finance.settle(user.id, dto);
  }

  @Get('report')
  @RequirePermission('manage_platform_finance')
  report(@Query() query: FinanceRangeDto) {
    return this.finance.platformReport(query.from, query.to);
  }
}
