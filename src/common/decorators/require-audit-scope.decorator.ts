import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLog';

export const RequireAuditScope = () => SetMetadata(AUDIT_LOG_KEY, true);
