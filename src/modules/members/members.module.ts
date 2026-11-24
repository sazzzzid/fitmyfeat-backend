import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { MembershipProductsController } from './membership-products.controller.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [StaffModule, SubscriptionsModule],
  controllers: [MembersController, MembershipProductsController],
  providers: [MembersService],
})
export class MembersModule {}
