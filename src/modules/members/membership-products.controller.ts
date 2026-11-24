import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireMemberAccess } from '../../common/decorators/require-member-access.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { MembershipProductDto } from './dto/index.js';
import { MembersService } from './members.service.js';

@Controller('membership-products')
export class MembershipProductsController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @RequireMemberAccess('view')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.membersService.listProducts(user.id);
  }

  @Post()
  @HttpCode(201)
  @RequireMemberAccess('create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MembershipProductDto,
  ) {
    return this.membersService.createProduct(user.id, dto);
  }

  @Patch(':id')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MembershipProductDto,
  ) {
    return this.membersService.updateProduct(user.id, id, dto);
  }
}
