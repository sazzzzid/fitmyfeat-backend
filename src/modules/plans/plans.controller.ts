import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { CreatePlanDto, UpdatePlanDto } from './dto/index.js';
import { PlansService } from './plans.service.js';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @RequirePermission('view_plans')
  listAvailable() {
    return this.plansService.listAvailable();
  }

  @Get('all')
  @RequirePermission('manage_plans')
  listAll() {
    return this.plansService.listAll();
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('manage_plans')
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':code')
  @HttpCode(200)
  @RequirePermission('manage_plans')
  update(@Param('code') code: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(code, dto);
  }
}
