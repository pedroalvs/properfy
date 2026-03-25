/**
 * Shared client-side validation helpers for forms.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return { score: 0, label: 'Too short' };

  let points = 0;
  if (/[a-z]/.test(password)) points++;
  if (/[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^a-zA-Z\d]/.test(password)) points++;
  if (password.length >= 12) points++;

  if (points <= 1) return { score: 1, label: 'Weak' };
  if (points === 2) return { score: 2, label: 'Fair' };
  if (points === 3) return { score: 3, label: 'Good' };
  return { score: 4, label: 'Strong' };
}
