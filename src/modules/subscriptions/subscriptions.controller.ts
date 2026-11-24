import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ListSubscriptionsQueryDto, SelectPlanDto } from './dto/index.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // The `me` routes are declared before `:id/mark-paid`.
  @Get('me')
  @RequirePermission('manage_gym_subscription')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getMine(user.id);
  }

  @Get('me/entitlements')
  @RequirePermission('manage_gym_subscription')
  getEntitlements(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getEntitlements(user.id);
  }

  @Post('me/trial')
  @HttpCode(201)
  @RequirePermission('manage_gym_subscription')
  startTrial(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectPlanDto,
  ) {
    return this.subscriptionsService.startTrial(user.id, dto.planCode);
  }

  @Post('me/plan-request')
  @HttpCode(201)
  @RequirePermission('manage_gym_subscription')
  requestPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectPlanDto,
  ) {
    return this.subscriptionsService.requestPlan(user.id, dto.planCode);
  }

  @Get()
  @RequirePermission('manage_subscriptions')
  list(@Query() query: ListSubscriptionsQueryDto) {
    return this.subscriptionsService.list(query.status, query);
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  @RequirePermission('manage_subscriptions')
  markPaid(@Param('id') id: string) {
    return this.subscriptionsService.markPaid(id);
  }
}
