import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Permission } from '../constants/permissions.js';
import { AUTHENTICATED_KEY } from '../decorators/authenticated.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import {
  AUDIT_LOG_KEY,
} from '../decorators/require-audit-scope.decorator.js';
import {
  MEMBER_ACCESS_KEY,
  type MemberAccess,
} from '../decorators/require-member-access.decorator.js';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

const PERMISSION_DISABLED = 'Permission is disabled';
const SESSION_REQUIRED = 'Authenticated_Session is required';
const STAFF_DISABLED = 'Staff account is disabled';

interface RequestWithUser {
  user?: AuthenticatedUser;
  query?: { scope?: unknown };
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    // Identity is available to any signed-in account, including one whose
    // permissions are all disabled. This is not a public route.
    if (
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets) ===
      true
    ) {
      if (!request.user) {
        throw new UnauthorizedException(SESSION_REQUIRED);
      }
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(AUDIT_LOG_KEY, targets) === true) {
      return this.allowAudit(request);
    }
    const access = this.reflector.getAllAndOverride<MemberAccess | undefined>(
      MEMBER_ACCESS_KEY,
      targets,
    );
    if (access) {
      return this.allowMemberAccess(request, access);
    }
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRE_PERMISSION_KEY,
      targets,
    );
    if (!permission) {
      throw new ForbiddenException(PERMISSION_DISABLED);
    }
    if (!request.user) {
      throw new UnauthorizedException(SESSION_REQUIRED);
    }
    return this.allowPermission(request.user, permission);
  }

  private async allowAudit(request: RequestWithUser): Promise<boolean> {
    if (!request.user) {
      throw new UnauthorizedException(SESSION_REQUIRED);
    }
    const scope = request.query?.scope;
    if (scope === 'platform') {
      return this.allowPermission(request.user, 'manage_roles');
    }
    if (scope === 'gym') {
      return this.allowPermission(request.user, 'manage_staff');
    }
    // A missing or unknown scope is a 400 from the service, not a 403.
    return true;
  }

  private async allowMemberAccess(
    request: RequestWithUser,
    access: MemberAccess,
  ): Promise<boolean> {
    if (!request.user) {
      throw new UnauthorizedException(SESSION_REQUIRED);
    }
    const staff = await this.prisma.staffMember.findUnique({
      where: { userId: request.user.id },
    });
    if (staff) {
      if (staff.disabledAt) {
        throw new ForbiddenException(STAFF_DISABLED);
      }
      const allowed =
        access === 'view'
          ? staff.canView
          : access === 'create'
            ? staff.canCreate
            : staff.canManage;
      if (!allowed) {
        throw new ForbiddenException(PERMISSION_DISABLED);
      }
      return true;
    }
    return this.allowPermission(request.user, 'manage_members');
  }

  private async allowPermission(
    user: AuthenticatedUser,
    permission: Permission,
  ): Promise<boolean> {
    const row = await this.prisma.rolePermission.findFirst({
      where: {
        roleId: user.roleId,
        permission: { name: permission },
      },
    });
    if (!row?.enabled) {
      throw new ForbiddenException(PERMISSION_DISABLED);
    }
    return true;
  }
}
