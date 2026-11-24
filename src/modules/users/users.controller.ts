import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { AssignRoleDto, ListUsersQueryDto } from './dto/index.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('manage_users')
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Put('role')
  @RequirePermission('manage_users')
  assignRole(@Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(dto.email, dto.roleName);
  }
}
