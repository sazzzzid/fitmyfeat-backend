import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Membership, MembershipProduct, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { pageBody, searchNeedle } from '../../common/validation/list-query.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { StaffService } from '../staff/staff.service.js';
import type { Entitlements } from '../subscriptions/subscription-state.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import {
  parseCreateMember,
  parseCreateProduct,
  parseMemberFilter,
  parsePayment,
  parseUpdateMember,
  parseUpdateProduct,
  type PaymentInput,
  type ProductValues,
} from './member-values.js';
import {
  addDays,
  isInEffect,
  matchesMemberFilter,
  reportedStatus,
  unfreezeEnd,
  type ReportedMembershipStatus,
} from './membership-state.js';

type Tx = Prisma.TransactionClient;

const GYM_NOT_ACTIVE = 'Member management requires an active gym';
const MEMBER_NOT_FOUND = 'Member was not found';
const PRODUCT_NOT_FOUND = 'Membership product was not found';
const PRODUCT_INACTIVE = 'Membership product is not active';
const ALREADY_HAS = 'Member already has a membership';
const NO_MEMBERSHIP = 'Member has no membership';
const FROZEN = 'Membership is frozen';
const FREEZE_REJECTED = 'Only an active membership can be frozen';
const NOT_FROZEN = 'Membership is not frozen';
const MEMBER_LEFT = 'Member has left';
const ALREADY_LEFT = 'Member has already left';
const NOT_LEFT = 'Member has not left';

export interface MembershipResponse {
  id: string;
  status: ReportedMembershipStatus;
  productId: string;
  productName: string;
  pricePaise: number;
  durationDays: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  frozenAt: string | null;
}

export interface MemberResponse {
  id: string;
  fullName: string;
  contact: string;
  notes: string | null;
  leftAt: string | null;
  createdAt: string;
  membership: MembershipResponse | null;
}

export interface ProductResponse {
  id: string;
  name: string;
  pricePaise: number;
  durationDays: number;
  isActive: boolean;
  createdAt: string;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async listMembers(
    ownerId: string,
    status?: unknown,
    query: { q?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ members: MemberResponse[]; nextCursor?: string | null }> {
    const filter = parseMemberFilter(status);
    const needle = searchNeedle(query.q);
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    const members = await this.prisma.member.findMany({
      where: { gymId },
      include: { membership: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const listed = members
      .filter((member) =>
        matchesMemberFilter(member.leftAt, member.membership, filter, now),
      )
      .filter(
        (member) =>
          !needle ||
          member.fullName.toLowerCase().includes(needle) ||
          member.contact.toLowerCase().includes(needle),
      )
      .map((member) => toMember(member, member.membership, now));
    return pageBody('members', listed, query.limit, query.cursor, (row) => row.id);
  }

  async createMember(ownerId: string, body: object): Promise<MemberResponse> {
    const input = parseCreateMember(body);
    const { allowDuplicateContact, ...values } = input;
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      if (!allowDuplicateContact) {
        const existing = await tx.member.findFirst({
          where: { gymId, contact: values.contact },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (existing) {
          throw new ConflictException(`Contact is already used by ${existing.fullName}`);
        }
      }
      const entitlements = await this.subscriptions.entitlementsForGym(gymId, now, tx);
      const count = await tx.member.count({ where: { gymId, leftAt: null } });
      if (entitlements.maxMembers !== null && count >= entitlements.maxMembers) {
        throw new ConflictException(memberLimitMessage(entitlements));
      }
      return tx.member.create({ data: { gymId, ...values } });
    });
    return toMember(member, null, now);
  }

  async updateMember(
    ownerId: string,
    id: string,
    body: object,
  ): Promise<MemberResponse> {
    const values = parseUpdateMember(body);
    const gymId = await this.requireActiveGym(ownerId);
    if (!isUUID(id)) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    const updated = await this.prisma.member.updateMany({
      where: { id, gymId },
      data: values,
    });
    if (updated.count === 0) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    const member = await this.prisma.member.findFirstOrThrow({
      where: { id, gymId },
      include: { membership: true },
    });
    return toMember(member, member.membership, new Date());
  }

  async listProducts(ownerId: string): Promise<{ products: ProductResponse[] }> {
    const gymId = await this.requireActiveGym(ownerId);
    const products = await this.prisma.membershipProduct.findMany({
      where: { gymId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { products: products.map(toProduct) };
  }

  async createProduct(ownerId: string, body: object): Promise<ProductResponse> {
    const values = parseCreateProduct(body);
    const gymId = await this.requireActiveGym(ownerId);
    const product = await this.prisma.membershipProduct.create({
      data: { gymId, ...values },
    });
    return toProduct(product);
  }

  async updateProduct(
    ownerId: string,
    id: string,
    body: object,
  ): Promise<ProductResponse> {
    const values = parseUpdateProduct(body);
    const gymId = await this.requireActiveGym(ownerId);
    if (!isUUID(id)) {
      throw new NotFoundException(PRODUCT_NOT_FOUND);
    }
    const updated = await this.prisma.membershipProduct.updateMany({
      where: { id, gymId },
      data: values,
    });
    if (updated.count === 0) {
      throw new NotFoundException(PRODUCT_NOT_FOUND);
    }
    const product = await this.prisma.membershipProduct.findFirstOrThrow({
      where: { id, gymId },
    });
    return toProduct(product);
  }

  async assign(ownerId: string, memberId: string, body: object): Promise<MemberResponse> {
    const productId = productIdFrom(body);
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    try {
      const member = await this.prisma.$transaction(async (tx) => {
        await lockGym(tx, gymId);
        const member = await this.loadMember(tx, gymId, memberId);
        const payment = parsePayment(body);
        this.rejectIfLeft(member);
        if (member.membership) {
          throw new ConflictException(ALREADY_HAS);
        }
        const product = await this.loadActiveProduct(tx, gymId, productId);
        const membership = await tx.membership.create({
          data: {
            memberId,
            productId: product.id,
            gymId,
            status: 'active',
            ...snapshotOf(product),
            currentPeriodStart: now,
            currentPeriodEnd: addDays(now, product.durationDays),
          },
        });
        await recordPayment(tx, {
          membershipId: membership.id,
          memberId,
          gymId,
          product,
          action: 'assign',
          payment,
        });
        return tx.member.findFirstOrThrow({
          where: { id: memberId },
          include: { membership: true },
        });
      });
      return toMember(member, member.membership, now);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(ALREADY_HAS);
      }
      throw error;
    }
  }

  async renew(ownerId: string, memberId: string, body: object): Promise<MemberResponse> {
    const payment = parsePayment(body);
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      const current = await this.loadMembership(tx, gymId, memberId);
      if (current.status === 'frozen') {
        throw new ConflictException(FROZEN);
      }
      const product = await tx.membershipProduct.findFirst({
        where: { id: current.productId, gymId },
      });
      if (!product) {
        throw new NotFoundException(PRODUCT_NOT_FOUND);
      }
      const period = isInEffect(current, now)
        ? { currentPeriodEnd: addDays(current.currentPeriodEnd, product.durationDays) }
        : {
            currentPeriodStart: now,
            currentPeriodEnd: addDays(now, product.durationDays),
          };
      await tx.membership.update({
        where: { id: current.id },
        data: { ...snapshotOf(product), ...period },
      });
      await recordPayment(tx, {
        membershipId: current.id,
        memberId,
        gymId,
        product,
        action: 'renew',
        payment,
      });
      return tx.member.findFirstOrThrow({
        where: { id: memberId },
        include: { membership: true },
      });
    });
    return toMember(member, member.membership, now);
  }

  async switchProduct(
    ownerId: string,
    memberId: string,
    body: object,
  ): Promise<MemberResponse> {
    const productId = productIdFrom(body);
    const payment = parsePayment(body);
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      const current = await this.loadMembership(tx, gymId, memberId);
      const product = await this.loadActiveProduct(tx, gymId, productId);
      await tx.membership.update({
        where: { id: current.id },
        data: {
          productId: product.id,
          status: 'active',
          frozenAt: null,
          ...snapshotOf(product),
          currentPeriodStart: now,
          currentPeriodEnd: addDays(now, product.durationDays),
        },
      });
      await recordPayment(tx, {
        membershipId: current.id,
        memberId,
        gymId,
        product,
        action: 'switch',
        payment,
      });
      return tx.member.findFirstOrThrow({
        where: { id: memberId },
        include: { membership: true },
      });
    });
    return toMember(member, member.membership, now);
  }

  async leave(ownerId: string, memberId: string): Promise<MemberResponse> {
    return this.setLeft(ownerId, memberId, true);
  }

  async restore(ownerId: string, memberId: string): Promise<MemberResponse> {
    return this.setLeft(ownerId, memberId, false);
  }

  async freeze(ownerId: string, memberId: string): Promise<MemberResponse> {
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      const current = await this.loadMembership(tx, gymId, memberId);
      if (!isInEffect(current, now)) {
        throw new ConflictException(FREEZE_REJECTED);
      }
      await tx.membership.update({
        where: { id: current.id },
        data: { status: 'frozen', frozenAt: now },
      });
      return tx.member.findFirstOrThrow({
        where: { id: memberId },
        include: { membership: true },
      });
    });
    return toMember(member, member.membership, now);
  }

  async unfreeze(ownerId: string, memberId: string): Promise<MemberResponse> {
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      const current = await this.loadMembership(tx, gymId, memberId);
      if (current.status !== 'frozen' || current.frozenAt === null) {
        throw new ConflictException(NOT_FROZEN);
      }
      await tx.membership.update({
        where: { id: current.id },
        data: {
          status: 'active',
          currentPeriodEnd: unfreezeEnd(current, now),
          frozenAt: null,
        },
      });
      return tx.member.findFirstOrThrow({
        where: { id: memberId },
        include: { membership: true },
      });
    });
    return toMember(member, member.membership, now);
  }

  private async setLeft(
    ownerId: string,
    memberId: string,
    leaving: boolean,
  ): Promise<MemberResponse> {
    const gymId = await this.requireActiveGym(ownerId);
    if (!isUUID(memberId)) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    const now = new Date();
    const existing = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
    });
    if (!existing) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    if (leaving && existing.leftAt) {
      throw new ConflictException(ALREADY_LEFT);
    }
    if (!leaving && !existing.leftAt) {
      throw new ConflictException(NOT_LEFT);
    }
    await this.prisma.member.update({
      where: { id: memberId },
      data: { leftAt: leaving ? now : null },
    });
    const member = await this.prisma.member.findFirstOrThrow({
      where: { id: memberId },
      include: { membership: true },
    });
    return toMember(member, member.membership, now);
  }

  private async requireActiveGym(callerId: string): Promise<string> {
    const gym = await this.staff.gymForCaller(callerId);
    if (gym.status !== 'active') {
      throw new ConflictException(GYM_NOT_ACTIVE);
    }
    return gym.id;
  }

  private async loadMembership(
    tx: Tx,
    gymId: string,
    memberId: string,
  ): Promise<Membership> {
    const member = await this.loadMember(tx, gymId, memberId);
    this.rejectIfLeft(member);
    if (!member.membership) {
      throw new ConflictException(NO_MEMBERSHIP);
    }
    return member.membership;
  }

  private async loadMember(tx: Tx, gymId: string, memberId: string) {
    if (!isUUID(memberId)) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    const member = await tx.member.findFirst({
      where: { id: memberId, gymId },
      include: { membership: true },
    });
    if (!member) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    return member;
  }

  private async loadActiveProduct(tx: Tx, gymId: string, productId: string) {
    const product = await tx.membershipProduct.findFirst({
      where: { id: productId, gymId },
    });
    if (!product) {
      throw new NotFoundException(PRODUCT_NOT_FOUND);
    }
    if (!product.isActive) {
      throw new ConflictException(PRODUCT_INACTIVE);
    }
    return product;
  }

  private rejectIfLeft(member: { leftAt: Date | null }): void {
    if (member.leftAt) {
      throw new ConflictException(MEMBER_LEFT);
    }
  }
}

function memberLimitMessage(_entitlements: Entitlements): string {
  return 'Member limit reached';
}

function productIdFrom(body: object): string {
  const productId = (body as { productId?: unknown }).productId;
  if (typeof productId !== 'string' || !isUUID(productId)) {
    throw new NotFoundException(PRODUCT_NOT_FOUND);
  }
  return productId;
}

async function lockGym(tx: Tx, gymId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "gyms" WHERE "id" = ${gymId}::uuid FOR UPDATE`;
}

async function recordPayment(
  tx: Tx,
  input: {
    membershipId: string;
    memberId: string;
    gymId: string;
    product: MembershipProduct;
    action: 'assign' | 'renew' | 'switch';
    payment: PaymentInput;
  },
): Promise<void> {
  await tx.membershipPayment.create({
    data: {
      membershipId: input.membershipId,
      memberId: input.memberId,
      gymId: input.gymId,
      productId: input.product.id,
      action: input.action,
      listPricePaise: input.product.pricePaise,
      amountReceivedPaise: input.payment.amountReceivedPaise,
      paidOn: input.payment.paidOn,
      method: input.payment.method,
    },
  });
}

function snapshotOf(product: Pick<ProductValues, 'name' | 'pricePaise' | 'durationDays'> & {
  name: string;
}) {
  return {
    productName: product.name,
    pricePaise: product.pricePaise,
    durationDays: product.durationDays,
  };
}

function toProduct(product: MembershipProduct): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    pricePaise: product.pricePaise,
    durationDays: product.durationDays,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  };
}

function toMembership(row: Membership, now: Date): MembershipResponse {
  return {
    id: row.id,
    status: reportedStatus(row, now),
    productId: row.productId,
    productName: row.productName,
    pricePaise: row.pricePaise,
    durationDays: row.durationDays,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd.toISOString(),
    frozenAt: row.frozenAt?.toISOString() ?? null,
  };
}

function toMember(
  member: {
    id: string;
    fullName: string;
    contact: string;
    notes: string | null;
    leftAt: Date | null;
    createdAt: Date;
  },
  membership: Membership | null,
  now: Date,
): MemberResponse {
  return {
    id: member.id,
    fullName: member.fullName,
    contact: member.contact,
    notes: member.notes,
    leftAt: member.leftAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    membership: membership ? toMembership(membership, now) : null,
  };
}
