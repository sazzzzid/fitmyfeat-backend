import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { CreateStaffDto, UpdateStaffDto } from './dto/index.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermission('manage_staff')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.staffService.list(user.id);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('manage_staff')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user.id, dto);
  }

  @Patch(':id')
  @HttpCode(200)
  @RequirePermission('manage_staff')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(user.id, id, dto);
  }

  @Post(':id/disable')
  @HttpCode(200)
  @RequirePermission('manage_staff')
  disable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staffService.disable(user.id, id);
  }

  @Post(':id/enable')
  @HttpCode(200)
  @RequirePermission('manage_staff')
  enable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staffService.enable(user.id, id);
  }
}
