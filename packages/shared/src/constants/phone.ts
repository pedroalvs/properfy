export const AU_E164_REGEX = /^\+61[23478]\d{8}$/;

export function isE164Au(s: string): boolean {
  return AU_E164_REGEX.test(s);
}
