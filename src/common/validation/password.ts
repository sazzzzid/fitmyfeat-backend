export function isAcceptedRegistrationPassword(
  value: unknown,
): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128;
}

export function isSignInPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
