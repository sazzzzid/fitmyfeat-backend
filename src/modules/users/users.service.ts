import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ROLE_NAMES } from '../../common/constants/role-names.js';
import { classifyEmail } from '../../common/validation/email-address.js';
import { pageBody, searchNeedle } from '../../common/validation/list-query.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const INVALID_ASSIGNMENT = 'Role assignment is not valid';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { q?: string; limit?: number; cursor?: string } = {}): Promise<{
    users: Array<{ email: string; role: string }>;
    nextCursor?: string | null;
  }> {
    const needle = searchNeedle(query.q);
    const users = await this.prisma.userAccount.findMany({
      select: { id: true, email: true, role: { select: { name: true } } },
      orderBy: [{ email: 'asc' }, { id: 'asc' }],
    });
    const listed = users
      .filter((user) => !needle || user.email.toLowerCase().includes(needle))
      .map((user) => ({ id: user.id, email: user.email, role: user.role.name }))
      .sort(
        (a, b) =>
          a.email.localeCompare(b.email) || (a.id ?? '').localeCompare(b.id ?? ''),
      );
    const page = pageBody('users', listed, query.limit, query.cursor, (row) => row.id);
    return {
      users: page.users.map(({ email, role }) => ({ email, role })),
      ...(query.limit !== undefined ? { nextCursor: page.nextCursor ?? null } : {}),
    };
  }

  async assignRole(
    emailInput: unknown,
    roleName: unknown,
  ): Promise<{ email: string; role: string }> {
    const email = classifyEmail(emailInput);
    if (email.status !== 'valid' || typeof roleName !== 'string') {
      throw new BadRequestException(INVALID_ASSIGNMENT);
    }
    if (roleName === ROLE_NAMES.gymStaff) {
      throw new BadRequestException(INVALID_ASSIGNMENT);
    }
    const user = await this.prisma.userAccount.findUnique({
      where: { emailKey: email.emailKey },
    });
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });
    if (!user || !role) {
      throw new BadRequestException(INVALID_ASSIGNMENT);
    }
    const staff = await this.prisma.staffMember.findUnique({
      where: { userId: user.id },
    });
    if (staff) {
      throw new ConflictException('Staff role cannot be changed');
    }
    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: { roleId: role.id },
    });
    return { email: user.email, role: role.name };
  }
}
