import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PRODUCT_VALUES_INVALID } from '../member-values.js';

const message = PRODUCT_VALUES_INVALID;

export class MembershipProductDto {
  @IsOptional()
  @IsString({ message })
  name?: string;

  @IsOptional()
  @IsInt({ message })
  pricePaise?: number;

  @IsOptional()
  @IsInt({ message })
  durationDays?: number;

  @IsOptional()
  @IsBoolean({ message })
  isActive?: boolean;
}
