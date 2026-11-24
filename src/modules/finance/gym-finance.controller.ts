import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ExpenseDto, FinanceRangeDto, OptionalDayRangeDto, OutstandingQueryDto } from './dto/index.js';
import { FinanceService } from './finance.service.js';

@Controller('gym-finance')
export class GymFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('income')
  @RequirePermission('manage_gym_finance')
  income(@CurrentUser() user: AuthenticatedUser, @Query() query: OptionalDayRangeDto) {
    return this.finance.income(user.id, query);
  }

  @Get('expenses')
  @RequirePermission('manage_gym_finance')
  expenses(@CurrentUser() user: AuthenticatedUser, @Query() query: OptionalDayRangeDto) {
    return this.finance.listExpenses(user.id, query);
  }

  @Post('expenses')
  @HttpCode(201)
  @RequirePermission('manage_gym_finance')
  createExpense(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExpenseDto) {
    return this.finance.createExpense(user.id, dto);
  }

  @Get('outstanding')
  @RequirePermission('manage_gym_finance')
  outstanding(@CurrentUser() user: AuthenticatedUser, @Query() query: OutstandingQueryDto) {
    return this.finance.outstanding(user.id, query);
  }

  @Get('ledger')
  @RequirePermission('manage_gym_finance')
  ledger(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceRangeDto) {
    return this.finance.ledger(user.id, query.from, query.to);
  }

  @Get('payments/:id/invoice')
  @RequirePermission('manage_gym_finance')
  invoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.finance.invoice(user.id, id);
  }

  @Get('payments/:id/receipt')
  @RequirePermission('manage_gym_finance')
  receipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.finance.receipt(user.id, id);
  }

  @Get('report')
  @RequirePermission('manage_gym_finance')
  report(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceRangeDto) {
    return this.finance.gymReport(user.id, query.from, query.to);
  }
}
