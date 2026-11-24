import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { readAccessCookie } from '../access-cookie.js';

interface AccessTokenPayload {
  sub?: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => readAccessCookie(request.headers.cookie),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwtSecret') ?? '',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Authenticated_Session is required');
    }
    const user = await this.prisma.userAccount.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('Authenticated_Session is required');
    }
    return { id: user.id, email: user.email, roleId: user.roleId };
  }
}
