import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { CreateRoleDto, UpdatePermissionDto } from './dto/index.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('manage_roles')
  list() {
    return this.rolesService.list();
  }

  @Post()
  @RequirePermission('manage_roles')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto.name);
  }

  @Patch('permissions')
  @RequirePermission('manage_roles')
  setPermission(@Body() dto: UpdatePermissionDto) {
    return this.rolesService.setPermission(
      dto.roleName,
      dto.permission,
      dto.state,
    );
  }
}
