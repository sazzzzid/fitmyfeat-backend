import { SetMetadata } from '@nestjs/common';

export const MEMBER_ACCESS_KEY = 'memberAccess';

export type MemberAccess = 'view' | 'create' | 'manage';

export const RequireMemberAccess = (access: MemberAccess) =>
  SetMetadata(MEMBER_ACCESS_KEY, access);
