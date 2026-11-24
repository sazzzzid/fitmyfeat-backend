import { Module } from '@nestjs/common';
import { OwnerProfilesController } from './owner-profiles.controller.js';
import { OwnerProfilesService } from './owner-profiles.service.js';

@Module({
  controllers: [OwnerProfilesController],
  providers: [OwnerProfilesService],
  exports: [OwnerProfilesService],
})
export class OwnerProfilesModule {}
