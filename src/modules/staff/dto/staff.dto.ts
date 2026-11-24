import { IsBoolean, IsOptional, IsString } from 'class-validator';
import {
  STAFF_VALUES_INVALID,
  TEMPLATE_VALUES_INVALID,
} from '../staff-values.js';

const staffMessage = STAFF_VALUES_INVALID;
const templateMessage = TEMPLATE_VALUES_INVALID;

export class CreateStaffDto {
  @IsOptional()
  @IsString({ message: staffMessage })
  email?: string;

  @IsOptional()
  @IsString({ message: staffMessage })
  password?: string;

  @IsOptional()
  @IsString({ message: staffMessage })
  fullName?: string;

  @IsOptional()
  @IsString({ message: staffMessage })
  title?: string;

  @IsOptional()
  @IsString({ message: staffMessage })
  template?: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString({ message: staffMessage })
  fullName?: string;

  @IsOptional()
  @IsString({ message: staffMessage })
  title?: string;

  @IsOptional()
  @IsString({ message: staffMessage })
  template?: string;

  @IsOptional()
  @IsBoolean({ message: staffMessage })
  view?: boolean;

  @IsOptional()
  @IsBoolean({ message: staffMessage })
  create?: boolean;

  @IsOptional()
  @IsBoolean({ message: staffMessage })
  manage?: boolean;

  @IsOptional()
  @IsString({ message: staffMessage })
  password?: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsBoolean({ message: templateMessage })
  view?: boolean;

  @IsOptional()
  @IsBoolean({ message: templateMessage })
  create?: boolean;

  @IsOptional()
  @IsBoolean({ message: templateMessage })
  manage?: boolean;
}
