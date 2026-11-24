import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const PROFILE_WHITESPACE = /[^ \t\r\n]/;

@Injectable()
export class OwnerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<{ displayName: string; contact: string }> {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      return { displayName: '', contact: '' };
    }
    return { displayName: profile.displayName, contact: profile.contact };
  }

  async update(
    userId: string,
    displayName: unknown,
    contact: unknown,
  ): Promise<{ displayName: string; contact: string }> {
    if (
      !isProfileValue(displayName, 100) ||
      !isProfileValue(contact, 254)
    ) {
      throw new BadRequestException(
        'Display name or contact value is empty or exceeds the maximum length',
      );
    }
    await this.prisma.ownerProfile.upsert({
      where: { userId },
      create: { userId, displayName, contact },
      update: { displayName, contact },
    });
    return { displayName, contact };
  }
}

function isProfileValue(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    PROFILE_WHITESPACE.test(value)
  );
}
