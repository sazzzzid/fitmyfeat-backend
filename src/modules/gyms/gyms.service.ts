import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Gym } from '@prisma/client';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  LOGO_REQUIRED,
  logoExtension,
  writeGymLogo,
  type LogoFile,
} from './gym-logo.js';
import {
  OPTIONAL_PROFILE_FIELDS,
  parseOptionalProfileValue,
} from './gym-profile-values.js';

const PROFILE_FIELDS = ['address', 'contact', 'gymName'] as const;
const SETUP_FIELDS = ['timing', 'address', 'contact', 'gymName'] as const;
const SETUP_INCOMPLETE = 'Setup is incomplete';
const STATUS_LOCKED =
  'Gym profile and basic setup cannot be changed while status is pending or active';
const EMPTY_VALUE = 'Submitted gym value must contain at least one character';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GymResponse {
  id: string;
  status: Gym['status'];
  gymName: string | null;
  address: string | null;
  contact: string | null;
  timing: string | null;
  logoValue: string | null;
  contactEmail: string | null;
  description: string | null;
  mapsUrl: string | null;
}

@Injectable()
export class GymsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string): Promise<GymResponse> {
    try {
      const gym = await this.prisma.gym.create({
        data: { ownerId, status: 'setup_in_progress' },
      });
      return toGym(gym);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Gym already exists');
      }
      throw error;
    }
  }

  async getMine(ownerId: string): Promise<GymResponse> {
    return toGym(await this.requireOwnedGym(ownerId));
  }

  async saveLogo(ownerId: string, file: LogoFile | undefined): Promise<GymResponse> {
    const gym = await this.requireOwnedGym(ownerId);
    if (gym.status !== 'setup_in_progress') {
      throw new ConflictException(STATUS_LOCKED);
    }
    if (!file) {
      throw new BadRequestException(LOGO_REQUIRED);
    }
    const extension = logoExtension(file);
    if (!extension) {
      throw new BadRequestException(LOGO_REQUIRED);
    }
    const logoValue = await writeGymLogo(gym.id, extension, file.buffer);
    return this.writeSetupFields(ownerId, { logoValue });
  }

  async updateProfile(ownerId: string, body: object): Promise<GymResponse> {
    const data = collectProfileFields(body);
    return this.writeSetupFields(ownerId, data);
  }

  async updateSetup(ownerId: string, body: object): Promise<GymResponse> {
    const data = collectFields(body, SETUP_FIELDS);
    return this.writeSetupFields(ownerId, data);
  }

  async completeSetup(ownerId: string): Promise<GymResponse> {
    const gym = await this.requireOwnedGym(ownerId);
    if (gym.status !== 'setup_in_progress') {
      throw new ConflictException(
        'Setup completion is not allowed for this gym status',
      );
    }
    if (!setupIsComplete(gym)) {
      throw new ConflictException(SETUP_INCOMPLETE);
    }
    const updated = await this.prisma.gym.updateMany({
      where: { id: gym.id, ownerId, status: 'setup_in_progress' },
      data: { status: 'pending', submittedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ConflictException(
        'Setup completion is not allowed for this gym status',
      );
    }
    return toGym(await this.requireOwnedGym(ownerId));
  }

  async listPending(): Promise<{
    gyms: Array<GymResponse & { ownerEmail: string }>;
  }> {
    const gyms = await this.prisma.gym.findMany({
      where: { status: 'pending' },
      include: { owner: { select: { email: true } } },
    });
    return {
      gyms: gyms.map((gym) => ({
        ...toGym(gym),
        ownerEmail: gym.owner.email,
      })),
    };
  }

  async activate(id: string): Promise<GymResponse> {
    if (!UUID.test(id)) {
      throw new NotFoundException('Activation requires one stored gym');
    }
    const updated = await this.prisma.gym.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'active', activatedAt: new Date() },
    });
    if (updated.count === 1) {
      const gym = await this.prisma.gym.findUnique({ where: { id } });
      if (!gym) {
        throw new NotFoundException('Activation requires one stored gym');
      }
      return toGym(gym);
    }
    const existing = await this.prisma.gym.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Activation requires one stored gym');
    }
    throw new ConflictException('Only a pending gym can be activated');
  }

  private async writeSetupFields(
    ownerId: string,
    data: Record<string, string | null>,
  ): Promise<GymResponse> {
    const gym = await this.requireOwnedGym(ownerId);
    if (gym.status !== 'setup_in_progress') {
      throw new ConflictException(STATUS_LOCKED);
    }
    const updated = await this.prisma.gym.updateMany({
      where: { id: gym.id, ownerId, status: 'setup_in_progress' },
      data,
    });
    if (updated.count === 0) {
      throw new ConflictException(STATUS_LOCKED);
    }
    return toGym(await this.requireOwnedGym(ownerId));
  }

  private async requireOwnedGym(ownerId: string): Promise<Gym> {
    const gym = await this.prisma.gym.findUnique({ where: { ownerId } });
    if (!gym) {
      throw new NotFoundException('Gym was not found');
    }
    return gym;
  }
}

function collectFields(
  body: object,
  fields: readonly string[],
): Record<string, string> {
  const record = body as Record<string, unknown>;
  const data: Record<string, string> = {};
  let present = false;
  for (const field of fields) {
    if (record[field] === undefined) {
      continue;
    }
    present = true;
    const value = record[field];
    if (typeof value !== 'string' || value.length < 1) {
      throw new BadRequestException(EMPTY_VALUE);
    }
    data[field] = value;
  }
  if (!present) {
    throw new BadRequestException(EMPTY_VALUE);
  }
  return data;
}

function collectProfileFields(body: object): Record<string, string | null> {
  const record = body as Record<string, unknown>;
  const data: Record<string, string | null> = {};
  let present = false;
  for (const field of PROFILE_FIELDS) {
    if (record[field] === undefined) {
      continue;
    }
    present = true;
    const value = record[field];
    if (typeof value !== 'string' || value.length < 1) {
      throw new BadRequestException(EMPTY_VALUE);
    }
    data[field] = value;
  }
  for (const field of OPTIONAL_PROFILE_FIELDS) {
    if (record[field] === undefined) {
      continue;
    }
    present = true;
    data[field] = parseOptionalProfileValue(field, record[field]);
  }
  if (!present) {
    throw new BadRequestException(EMPTY_VALUE);
  }
  return data;
}

function setupIsComplete(gym: Gym): boolean {
  return [
    gym.gymName,
    gym.address,
    gym.contact,
    gym.timing,
    gym.logoValue,
  ].every((value) => typeof value === 'string' && value.length >= 1);
}

function toGym(gym: Gym): GymResponse {
  return {
    id: gym.id,
    status: gym.status,
    gymName: gym.gymName,
    address: gym.address,
    contact: gym.contact,
    timing: gym.timing,
    logoValue: gym.logoValue,
    contactEmail: gym.contactEmail,
    description: gym.description,
    mapsUrl: gym.mapsUrl,
  };
}
