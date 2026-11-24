import { Module } from '@nestjs/common';
import { GymsController } from './gyms.controller.js';
import { GymsService } from './gyms.service.js';

@Module({
  controllers: [GymsController],
  providers: [GymsService],
  exports: [GymsService],
})
export class GymsModule {}
