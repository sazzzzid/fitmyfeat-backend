import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireMemberAccess } from '../../common/decorators/require-member-access.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AssignMembershipDto, ListMembersQueryDto, MemberDto, RecordPaymentDto } from './dto/index.js';
import { MembersService } from './members.service.js';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @RequireMemberAccess('view')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMembersQueryDto) {
    return this.membersService.listMembers(user.id, query.status, query);
  }

  @Post()
  @HttpCode(201)
  @RequireMemberAccess('create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: MemberDto) {
    return this.membersService.createMember(user.id, dto);
  }

  @Patch(':id')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MemberDto,
  ) {
    return this.membersService.updateMember(user.id, id, dto);
  }

  @Post(':id/leave')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.membersService.leave(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.membersService.restore(user.id, id);
  }

  @Post(':id/membership')
  @HttpCode(201)
  @RequireMemberAccess('create')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignMembershipDto,
  ) {
    return this.membersService.assign(user.id, id, dto);
  }

  @Post(':id/membership/renew')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  renew(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.membersService.renew(user.id, id, dto);
  }

  @Post(':id/membership/switch')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  switchProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignMembershipDto,
  ) {
    return this.membersService.switchProduct(user.id, id, dto);
  }

  @Post(':id/membership/freeze')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  freeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.membersService.freeze(user.id, id);
  }

  @Post(':id/membership/unfreeze')
  @HttpCode(200)
  @RequireMemberAccess('manage')
  unfreeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.membersService.unfreeze(user.id, id);
  }
}
