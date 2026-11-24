import { IsOptional, IsString } from 'class-validator';

export class UpdateGymSetupDto {
  @IsOptional()
  @IsString()
  timing?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  gymName?: string;
}
