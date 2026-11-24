import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireAuditScope } from '../../common/decorators/require-audit-scope.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AuditLogQueryDto } from './dto/index.js';
import { StaffService } from './staff.service.js';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequireAuditScope()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto) {
    return this.staffService.listAudit(user.id, query.scope, query);
  }
}
