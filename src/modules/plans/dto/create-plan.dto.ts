import { IsOptional, IsString } from 'class-validator';
import { PLAN_VALUES_INVALID } from '../plan-values.js';
import { UpdatePlanDto } from './update-plan.dto.js';

export class CreatePlanDto extends UpdatePlanDto {
  @IsOptional()
  @IsString({ message: PLAN_VALUES_INVALID })
  code?: string;
}
