import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { CommunicationsService } from './communications.service.js';
import { AutomationDto, MessageRangeDto, SendMessageDto } from './dto/index.js';

@Controller('gym-communications')
export class GymCommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('messages')
  @RequirePermission('manage_communications')
  messages(@CurrentUser() user: AuthenticatedUser, @Query() query: MessageRangeDto) {
    return this.communications.listMessages(user.id, query.from, query.to);
  }

  @Post('messages')
  @HttpCode(201)
  @RequirePermission('manage_communications')
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendMessageDto) {
    return this.communications.send(user.id, dto);
  }

  @Get('automations')
  @RequirePermission('manage_communications')
  automations(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.automations(user.id);
  }

  @Put('automations')
  @HttpCode(200)
  @RequirePermission('manage_communications')
  updateAutomations(@CurrentUser() user: AuthenticatedUser, @Body() dto: AutomationDto) {
    return this.communications.updateAutomations(user.id, dto);
  }

  @Post('run')
  @HttpCode(200)
  @RequirePermission('manage_communications')
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.run(user.id);
  }
}
