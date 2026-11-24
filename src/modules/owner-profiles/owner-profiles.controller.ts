import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { UpdateOwnerProfileDto } from './dto/index.js';
import { OwnerProfilesService } from './owner-profiles.service.js';

@Controller('owner-profile')
export class OwnerProfilesController {
  constructor(private readonly ownerProfilesService: OwnerProfilesService) {}

  @Get()
  @RequirePermission('manage_owner_profile')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.ownerProfilesService.get(user.id);
  }

  @Put()
  @RequirePermission('manage_owner_profile')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOwnerProfileDto,
  ) {
    return this.ownerProfilesService.update(
      user.id,
      dto.displayName,
      dto.contact,
    );
  }
}
