import { IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  roleName?: string;
}
