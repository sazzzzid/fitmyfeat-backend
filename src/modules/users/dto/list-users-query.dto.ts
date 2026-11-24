import { IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { QUERY_INVALID } from '../../../common/validation/list-query.js';

export class ListUsersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  q?: string;
}
