import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { UpdateGymProfileDto, UpdateGymSetupDto } from './dto/index.js';
import type { LogoFile } from './gym-logo.js';
import { GymsService } from './gyms.service.js';

@Controller('gyms')
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  @Get('me')
  @RequirePermission('manage_gym_setup')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.gymsService.getMine(user.id);
  }

  @Get('pending')
  @RequirePermission('review_gyms')
  listPending() {
    return this.gymsService.listPending();
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('create_gym')
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.gymsService.create(user.id);
  }

  @Post('me/logo')
  @HttpCode(200)
  @RequirePermission('manage_gym_setup')
  @UseInterceptors(FileInterceptor('logo'))
  saveLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: LogoFile | undefined,
  ) {
    return this.gymsService.saveLogo(user.id, file);
  }

  @Patch('me/profile')
  @RequirePermission('manage_gym_setup')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateGymProfileDto,
  ) {
    return this.gymsService.updateProfile(user.id, dto);
  }

  @Patch('me/setup')
  @RequirePermission('manage_gym_setup')
  updateSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateGymSetupDto,
  ) {
    return this.gymsService.updateSetup(user.id, dto);
  }

  @Post('me/complete-setup')
  @RequirePermission('manage_gym_setup')
  completeSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.gymsService.completeSetup(user.id);
  }

  @Post(':id/activate')
  @RequirePermission('review_gyms')
  activate(@Param('id') id: string) {
    return this.gymsService.activate(id);
  }
}
