import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { MessageRangeDto, TemplateDto } from './dto/index.js';
import { CommunicationsService } from './communications.service.js';

@Controller()
export class MessageTemplatesController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('message-templates')
  @RequirePermission('manage_message_templates')
  list() {
    return this.communications.listTemplates();
  }

  @Post('message-templates')
  @HttpCode(201)
  @RequirePermission('manage_message_templates')
  create(@Body() dto: TemplateDto) {
    return this.communications.createTemplate(dto);
  }

  @Patch('message-templates/:id')
  @HttpCode(200)
  @RequirePermission('manage_message_templates')
  update(@Param('id') id: string, @Body() dto: TemplateDto) {
    return this.communications.updateTemplate(id, dto);
  }

  @Get('communications/analytics')
  @RequirePermission('manage_message_templates')
  analytics(@Query() query: MessageRangeDto) {
    return this.communications.analytics(query.from, query.to);
  }
}
