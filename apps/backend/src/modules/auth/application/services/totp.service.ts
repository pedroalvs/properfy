import { authenticator } from 'otplib';

export class TotpService {
  constructor() {
    // Allow 1 step tolerance (±30 seconds)
    authenticator.options = { window: 1 };
  }

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  generateToken(secret: string): string {
    return authenticator.generate(secret);
  }

  verify(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  generateUri(email: string, secret: string, issuer = 'Properfy'): string {
    return authenticator.keyuri(email, issuer, secret);
  }
}
