export const ACCESS_COOKIE = 'shark.access-token';
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60;

export const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
};

export function readAccessCookie(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== ACCESS_COOKIE) {
      continue;
    }
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
