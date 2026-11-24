import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { MEMBER_VALUES_INVALID } from '../member-values.js';

const message = MEMBER_VALUES_INVALID;

export class MemberDto {
  @IsOptional()
  @IsString({ message })
  fullName?: string;

  @IsOptional()
  @IsString({ message })
  contact?: string;

  @IsOptional()
  @IsString({ message })
  notes?: string | null;

  @IsOptional()
  @IsBoolean({ message })
  allowDuplicateContact?: boolean;
}
