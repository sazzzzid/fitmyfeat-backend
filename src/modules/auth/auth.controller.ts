import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Authenticated } from '../../common/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ACCESS_COOKIE, ACCESS_COOKIE_OPTIONS } from './access-cookie.js';
import { AuthService } from './auth.service.js';
import { RegisterDto, SignInDto } from './dto/index.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password);
  }

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const body = await this.authService.signIn(dto.email, dto.password);
    response.cookie(ACCESS_COOKIE, body.accessToken, ACCESS_COOKIE_OPTIONS);
    return body;
  }

  @Public()
  @Post('sign-out')
  @HttpCode(204)
  signOut(@Res({ passthrough: true }) response: Response): void {
    response.cookie(ACCESS_COOKIE, '', { ...ACCESS_COOKIE_OPTIONS, maxAge: 0 });
  }

  @Get('me')
  @Authenticated()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.currentUser(user);
  }
}
