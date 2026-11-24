import { IsInt, IsOptional, IsString } from 'class-validator';
import { PAYMENT_INVALID } from '../member-values.js';

const message = PAYMENT_INVALID;

export class RecordPaymentDto {
  @IsOptional()
  @IsInt({ message })
  amountReceivedPaise?: number;

  @IsOptional()
  @IsString({ message })
  paidOn?: string;

  @IsOptional()
  @IsString({ message })
  method?: string;
}
