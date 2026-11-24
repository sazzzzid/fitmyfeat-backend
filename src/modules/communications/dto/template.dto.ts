import { Allow, IsBoolean, IsOptional, IsString } from 'class-validator';
import { FINANCE_RANGE_INVALID } from '../../finance/finance-values.js';
import { TEMPLATE_VALUES_INVALID } from '../message-values.js';

const message = TEMPLATE_VALUES_INVALID;

export class TemplateDto {
  @IsOptional()
  @IsString({ message })
  channel?: string;

  @IsOptional()
  @IsString({ message })
  name?: string;

  @IsOptional()
  @IsString({ message })
  body?: string;

  @IsOptional()
  @IsBoolean({ message })
  isActive?: boolean;
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;
}

export class AutomationDto {
  @IsOptional()
  @Allow()
  expiry?: unknown;

  @IsOptional()
  @Allow()
  payment?: unknown;

  @IsOptional()
  @Allow()
  inactive?: unknown;
}

export class MessageRangeDto {
  @IsOptional()
  @IsString({ message: FINANCE_RANGE_INVALID })
  from?: string;

  @IsOptional()
  @IsString({ message: FINANCE_RANGE_INVALID })
  to?: string;
}
