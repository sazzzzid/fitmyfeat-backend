const EDGE_WHITESPACE = new Set([' ', '\t', '\r', '\n']);

export function trimPhase1Edges(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && EDGE_WHITESPACE.has(value[start] ?? '')) {
    start += 1;
  }
  while (end > start && EDGE_WHITESPACE.has(value[end - 1] ?? '')) {
    end -= 1;
  }
  return value.slice(start, end);
}

export function toEmailKey(email: string): string {
  return email.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export function isValidEmailAddress(email: string): boolean {
  if (email.length < 3 || email.length > 254) {
    return false;
  }
  if (/[ \t\r\n]/.test(email)) {
    return false;
  }
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) {
    return false;
  }
  if (email.indexOf('@', at + 1) !== -1) {
    return false;
  }
  return true;
}

export type ClassifiedEmail =
  | { status: 'required' }
  | { status: 'invalid' }
  | { status: 'valid'; email: string; emailKey: string };

export function classifyEmail(input: unknown): ClassifiedEmail {
  if (typeof input !== 'string') {
    return { status: 'required' };
  }
  const email = trimPhase1Edges(input);
  if (email.length === 0) {
    return { status: 'required' };
  }
  if (!isValidEmailAddress(email)) {
    return { status: 'invalid' };
  }
  return { status: 'valid', email, emailKey: toEmailKey(email) };
}
