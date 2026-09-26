import { authenticator } from 'otplib';

// Configure ONCE, at module scope, on a PRIVATE cloned instance rather than
// mutating the shared global `authenticator.options` in the constructor (#687).
// The old constructor assignment was a process-wide side effect: every new
// TotpService reset options on the module-global `authenticator`, so any other
// otplib consumer inherited whatever the last-constructed service set.
const totp = authenticator.clone({ window: 1 }); // ±30s (one step) tolerance

export class TotpService {
  generateSecret(): string {
    return totp.generateSecret();
  }

  generateToken(secret: string): string {
    return totp.generate(secret);
  }

  verify(token: string, secret: string): boolean {
    try {
      return totp.verify({ token, secret });
    } catch {
      return false;
    }
  }

  generateUri(email: string, secret: string, issuer = 'Properfy'): string {
    return totp.keyuri(email, issuer, secret);
  }
}
