import { IsIn, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { QUERY_INVALID } from '../../../common/validation/list-query.js';
import {
  MEMBER_FILTERS,
  MEMBER_FILTER_INVALID,
  type MemberFilter,
} from '../member-values.js';

export class ListMembersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(MEMBER_FILTERS, { message: MEMBER_FILTER_INVALID })
  status?: MemberFilter;

  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  q?: string;
}
