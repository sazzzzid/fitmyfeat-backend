import { IsIn, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import {
  SUBSCRIPTION_STATUSES,
  type ReportedSubscriptionStatus,
} from '../../../common/constants/subscription-status.js';
import { QUERY_INVALID } from '../../../common/validation/list-query.js';
import { SUBSCRIPTION_ERRORS } from '../subscription-errors.js';

export class ListSubscriptionsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES, { message: SUBSCRIPTION_ERRORS.filterInvalid })
  status?: ReportedSubscriptionStatus;

  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  q?: string;
}
