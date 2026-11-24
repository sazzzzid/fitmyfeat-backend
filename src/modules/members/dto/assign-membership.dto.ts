import { IsOptional, IsString } from 'class-validator';
import { PRODUCT_VALUES_INVALID } from '../member-values.js';
import { RecordPaymentDto } from './record-payment.dto.js';

export class AssignMembershipDto extends RecordPaymentDto {
  @IsOptional()
  @IsString({ message: PRODUCT_VALUES_INVALID })
  productId?: string;
}
