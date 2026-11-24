import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { PLAN_VALUES_INVALID } from '../plan-values.js';

const message = PLAN_VALUES_INVALID;

// Types only. Presence, ranges, and patterns are checked in plan-values.ts.
// There is no `code` property, so the pipe rejects a body that tries to
// change it.
export class UpdatePlanDto {
  @IsOptional()
  @IsString({ message })
  name?: string;

  @IsOptional()
  @IsInt({ message })
  priceMonthlyPaise?: number;

  @IsOptional()
  @IsInt({ message })
  trialDays?: number;

  @IsOptional()
  @IsArray({ message })
  @IsString({ each: true, message })
  featureFlags?: string[];

  @IsOptional()
  @IsInt({ message })
  maxMembers?: number | null;

  @IsOptional()
  @IsInt({ message })
  maxStaff?: number | null;

  @IsOptional()
  @IsInt({ message })
  maxBranches?: number | null;

  @IsOptional()
  @IsBoolean({ message })
  isActive?: boolean;
}
