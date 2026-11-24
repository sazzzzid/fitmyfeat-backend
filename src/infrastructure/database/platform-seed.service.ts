import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import {
  PERMISSIONS,
  type Permission,
} from '../../common/constants/permissions.js';
import { ROLE_NAMES } from '../../common/constants/role-names.js';
import { ROLE_TEMPLATES } from '../../common/constants/role-templates.js';
import { classifyEmail } from '../../common/validation/email-address.js';
import { isAcceptedRegistrationPassword } from '../../common/validation/password.js';
import { isUniqueViolation } from './prisma-error.js';
import { PrismaService } from './prisma.service.js';

const SUPER_ADMIN_ENABLED = new Set<Permission>([
  'view_dashboard',
  'manage_users',
  'manage_roles',
  'review_gyms',
  'manage_plans',
  'manage_subscriptions',
  'manage_platform_finance',
  'manage_message_templates',
]);

const GYM_OWNER_ENABLED = new Set<Permission>([
  'create_gym',
  'manage_owner_profile',
  'manage_gym_setup',
  'view_plans',
  'manage_gym_subscription',
  'manage_members',
  'manage_staff',
  'manage_gym_finance',
  'manage_communications',
]);

@Injectable()
export class PlatformSeedService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    const databaseUrl = this.config.get<string>('databaseUrl');
    const jwtSecret = this.config.get<string>('jwtSecret');
    const adminEmail = this.config.get<string>('superAdminEmail');
    const adminPassword = this.config.get<string>('superAdminPassword');
    if (!databaseUrl || !jwtSecret || !adminEmail || adminPassword == null) {
      throw new Error(
        'DATABASE_URL, JWT_SECRET, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are required',
      );
    }
    const email = classifyEmail(adminEmail);
    if (email.status !== 'valid') {
      throw new Error('SUPER_ADMIN_EMAIL is not a valid Email_Address');
    }
    if (!isAcceptedRegistrationPassword(adminPassword)) {
      throw new Error('SUPER_ADMIN_PASSWORD is not accepted');
    }

    for (const name of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }

    for (const name of [
      ROLE_NAMES.superAdmin,
      ROLE_NAMES.gymOwner,
      ROLE_NAMES.gymStaff,
    ]) {
      await this.prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }

    const permissions = await this.prisma.permission.findMany({
      where: { name: { in: [...PERMISSIONS] } },
    });
    // Every Role gets a row for every Permission. Rows that already exist
    // are skipped, so saved states survive and older custom Roles receive
    // newly added Permissions as disabled.
    const roles = await this.prisma.role.findMany();
    await this.prisma.rolePermission.createMany({
      data: roles.flatMap((role) =>
        permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
          enabled: enabledFor(role.name, permission.name),
        })),
      ),
      skipDuplicates: true,
    });

    await this.seedTemplates();

    const existingAdmin = await this.prisma.userAccount.findUnique({
      where: { emailKey: email.emailKey },
    });
    if (existingAdmin) {
      return;
    }
    const superAdmin = roles.find(
      (role) => role.name === ROLE_NAMES.superAdmin,
    );
    if (!superAdmin) {
      throw new Error('Super_Admin role was not seeded');
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    try {
      await this.prisma.userAccount.create({
        data: {
          email: email.email,
          emailKey: email.emailKey,
          passwordHash,
          roleId: superAdmin.id,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  private async seedTemplates(): Promise<void> {
    for (const template of ROLE_TEMPLATES) {
      const existing = await this.prisma.roleTemplate.findUnique({
        where: { name: template.name },
      });
      if (existing) {
        continue;
      }
      try {
        await this.prisma.roleTemplate.create({
          data: {
            name: template.name,
            sortOrder: template.sortOrder,
            canView: template.canView,
            canCreate: template.canCreate,
            canManage: template.canManage,
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }
  }
}

function enabledFor(roleName: string, permissionName: string): boolean {
  if (!isPermission(permissionName)) {
    return false;
  }
  if (roleName === ROLE_NAMES.superAdmin) {
    return SUPER_ADMIN_ENABLED.has(permissionName);
  }
  if (roleName === ROLE_NAMES.gymOwner) {
    return GYM_OWNER_ENABLED.has(permissionName);
  }
  return false;
}

function isPermission(name: string): name is Permission {
  return (PERMISSIONS as readonly string[]).includes(name);
}
