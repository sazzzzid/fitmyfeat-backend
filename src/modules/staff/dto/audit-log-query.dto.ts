import { IsOptional, IsString } from 'class-validator';
import { OptionalDayRangeDto } from '../../../common/dto/page-query.dto.js';

export class AuditLogQueryDto extends OptionalDayRangeDto {
  @IsOptional()
  @IsString()
  scope?: string;
}
