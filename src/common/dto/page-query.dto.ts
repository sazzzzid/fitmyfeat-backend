import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { QUERY_INVALID } from '../validation/list-query.js';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: QUERY_INVALID })
  @Min(1, { message: QUERY_INVALID })
  @Max(100, { message: QUERY_INVALID })
  limit?: number;

  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  cursor?: string;
}

export class OptionalDayRangeDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  from?: string;

  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  to?: string;
}
