import { Body, Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { UpdateTemplateDto } from './dto/index.js';
import { StaffService } from './staff.service.js';

@Controller('role-templates')
export class RoleTemplatesController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermission('manage_roles')
  list() {
    return this.staffService.listTemplates();
  }

  @Patch(':name')
  @HttpCode(200)
  @RequirePermission('manage_roles')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('name') name: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.staffService.updateTemplate(user.id, name, dto);
  }
}
