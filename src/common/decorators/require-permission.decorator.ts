import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../constants/permissions.js';

export const REQUIRE_PERMISSION_KEY = 'requiredPermission';

export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
