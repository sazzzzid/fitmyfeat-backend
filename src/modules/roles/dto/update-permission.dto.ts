import { IsOptional, IsString } from 'class-validator';

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  roleName?: string;

  @IsOptional()
  @IsString()
  permission?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
