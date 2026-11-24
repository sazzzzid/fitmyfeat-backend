import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import {
  PERMISSIONS,
  type Permission,
} from '../../common/constants/permissions.js';
import { ROLE_NAMES } from '../../common/constants/role-names.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { classifyEmail } from '../../common/validation/email-address.js';
import {
  isAcceptedRegistrationPassword,
  isSignInPassword,
} from '../../common/validation/password.js';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

let dummyHash: string | undefined;

async function dummyPasswordHash(): Promise<string> {
  dummyHash ??= await bcrypt.hash('dummy-password', 12);
  return dummyHash;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(
    emailInput: unknown,
    password: unknown,
  ): Promise<{ email: string; role: typeof ROLE_NAMES.gymOwner }> {
    const email = classifyEmail(emailInput);
    if (email.status === 'required') {
      throw new BadRequestException('Email_Address is required');
    }
    if (email.status === 'invalid') {
      throw new BadRequestException('Email_Address is not valid');
    }
    if (!isAcceptedRegistrationPassword(password)) {
      throw new BadRequestException('Password is not accepted');
    }
    const role = await this.prisma.role.findUnique({
      where: { name: ROLE_NAMES.gymOwner },
    });
    if (!role) {
      throw new Error('Gym_Owner role is not seeded');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.userAccount.create({
        data: {
          email: email.email,
          emailKey: email.emailKey,
          passwordHash,
          roleId: role.id,
        },
      });
      return { email: user.email, role: ROLE_NAMES.gymOwner };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email_Address is already used');
      }
      throw error;
    }
  }

  async signIn(
    emailInput: unknown,
    password: unknown,
  ): Promise<{ accessToken: string }> {
    const email = classifyEmail(emailInput);
    if (email.status !== 'valid' || !isSignInPassword(password)) {
      throw new BadRequestException('Sign-in input is invalid');
    }
    const user = await this.prisma.userAccount.findUnique({
      where: { emailKey: email.emailKey },
    });
    const hash = user?.passwordHash ?? (await dummyPasswordHash());
    const matches = await bcrypt.compare(password, hash);
    if (!user || !matches) {
      throw new UnauthorizedException(
        'Email_Address and password do not match a User_Account',
      );
    }
    const staff = await this.prisma.staffMember.findUnique({
      where: { userId: user.id },
    });
    if (staff?.disabledAt) {
      throw new ForbiddenException('Staff account is disabled');
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken };
  }

  async currentUser(user: AuthenticatedUser): Promise<{
    id: string;
    email: string;
    role: string;
    permissions: Permission[];
    staff?: {
      gymId: string;
      title: string;
      template: string;
      view: boolean;
      create: boolean;
      manage: boolean;
      disabled: boolean;
    };
  }> {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        role: {
          select: {
            name: true,
            permissions: {
              where: { enabled: true },
              select: { permission: { select: { name: true } } },
            },
          },
        },
        staffMember: {
          select: {
            gymId: true,
            title: true,
            canView: true,
            canCreate: true,
            canManage: true,
            disabledAt: true,
            template: { select: { name: true } },
          },
        },
      },
    });
    if (!account) {
      throw new UnauthorizedException('Authenticated_Session is required');
    }
    const enabled = new Set(
      account.role.permissions.map((row) => row.permission.name),
    );
    const body = {
      id: account.id,
      email: account.email,
      role: account.role.name,
      permissions: PERMISSIONS.filter((name) => enabled.has(name)),
    };
    if (!account.staffMember) {
      return body;
    }
    return {
      ...body,
      staff: {
        gymId: account.staffMember.gymId,
        title: account.staffMember.title,
        template: account.staffMember.template.name,
        view: account.staffMember.canView,
        create: account.staffMember.canCreate,
        manage: account.staffMember.canManage,
        disabled: account.staffMember.disabledAt !== null,
      },
    };
  }
}
