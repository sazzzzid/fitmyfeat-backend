import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_KEY = 'authenticated';

/** Signed-in route with no permission requirement. JWT still applies. */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);
