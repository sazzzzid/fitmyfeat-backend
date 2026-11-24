import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import configuration from './config/configuration.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { GymsModule } from './modules/gyms/gyms.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { CommunicationsModule } from './modules/communications/communications.module.js';
import { OwnerProfilesModule } from './modules/owner-profiles/owner-profiles.module.js';
import { PlansModule } from './modules/plans/plans.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OwnerProfilesModule,
    GymsModule,
    DashboardModule,
    PlansModule,
    SubscriptionsModule,
    MembersModule,
    StaffModule,
    FinanceModule,
    CommunicationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
