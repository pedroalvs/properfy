export interface PasswordPolicyResult {
  valid: boolean;
  violations: string[];
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const violations: string[] = [];

  if (password.length < 8) {
    violations.push('Password must be at least 8 characters');
  }
  // Upper bound guards two things at once: an unbounded-input hashing DoS
  // (bcrypt on a multi-megabyte string), and the silent bcrypt truncation at 72
  // bytes — beyond which extra characters add no strength and mislead the user.
  // 128 chars is comfortably above any real passphrase.
  if (password.length > 128) {
    violations.push('Password must be at most 128 characters');
  }
  if (!/[A-Z]/.test(password)) {
    violations.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    violations.push('Password must contain at least one lowercase letter');
  }
  if (!/\d/.test(password)) {
    violations.push('Password must contain at least one digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    violations.push('Password must contain at least one special character');
  }

  return { valid: violations.length === 0, violations };
}
