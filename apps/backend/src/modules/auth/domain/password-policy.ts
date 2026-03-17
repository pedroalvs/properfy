export interface PasswordPolicyResult {
  valid: boolean;
  violations: string[];
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const violations: string[] = [];

  if (password.length < 8) {
    violations.push('Password must be at least 8 characters');
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
