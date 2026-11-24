import { Allow, IsOptional, IsString } from 'class-validator';

export class UpdateGymProfileDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  gymName?: string;

  @Allow()
  contactEmail?: string | null;

  @Allow()
  description?: string | null;

  @Allow()
  mapsUrl?: string | null;
}
