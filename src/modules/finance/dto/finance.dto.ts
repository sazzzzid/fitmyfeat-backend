import { IsInt, IsOptional, IsString } from 'class-validator';
import { OptionalDayRangeDto, PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { QUERY_INVALID } from '../../../common/validation/list-query.js';
import {
  EXPENSE_VALUES_INVALID,
  FINANCE_FILTER_INVALID,
  FINANCE_RANGE_INVALID,
  SETTLEMENT_MONTH_INVALID,
} from '../finance-values.js';

export class FinanceRangeDto {
  @IsOptional()
  @IsString({ message: FINANCE_RANGE_INVALID })
  from?: string;

  @IsOptional()
  @IsString({ message: FINANCE_RANGE_INVALID })
  to?: string;
}

export class ChargeFilterDto extends OptionalDayRangeDto {
  @IsOptional()
  @IsString({ message: FINANCE_FILTER_INVALID })
  status?: string;

  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  gymId?: string;
}

export class OutstandingQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: QUERY_INVALID })
  q?: string;
}

export class SettlementDto {
  @IsOptional()
  @IsString({ message: SETTLEMENT_MONTH_INVALID })
  month?: string;
}

export class ExpenseDto {
  @IsOptional()
  @IsString({ message: EXPENSE_VALUES_INVALID })
  category?: string;

  @IsOptional()
  @IsInt({ message: EXPENSE_VALUES_INVALID })
  amountPaise?: number;

  @IsOptional()
  @IsString({ message: EXPENSE_VALUES_INVALID })
  paidOn?: string;

  @IsOptional()
  @IsString({ message: EXPENSE_VALUES_INVALID })
  notes?: string | null;
}
