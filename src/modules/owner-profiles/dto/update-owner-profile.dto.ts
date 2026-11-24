import { IsOptional, IsString } from 'class-validator';

export class UpdateOwnerProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  contact?: string;
}
