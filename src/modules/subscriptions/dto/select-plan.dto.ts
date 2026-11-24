import { IsOptional, IsString } from 'class-validator';
import { SUBSCRIPTION_ERRORS } from '../subscription-errors.js';

export class SelectPlanDto {
  @IsOptional()
  @IsString({ message: SUBSCRIPTION_ERRORS.selectionInvalid })
  planCode?: string;
}
