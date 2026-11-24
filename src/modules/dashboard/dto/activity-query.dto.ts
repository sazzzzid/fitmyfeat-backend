import { IsString } from 'class-validator';
import { QUERY_INVALID } from '../../../common/validation/list-query.js';

export class ActivityQueryDto {
  @IsString({ message: QUERY_INVALID })
  from?: string;

  @IsString({ message: QUERY_INVALID })
  to?: string;
}
