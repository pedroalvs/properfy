import { Aes256GcmService } from '../../../shared/infrastructure/crypto/aes-256-gcm.service';

/** Thin wrapper around Aes256GcmService for TOTP secret encryption. */
export class TotpEncryptionService {
  private readonly aes: Aes256GcmService;

  constructor(encryptionKey: string) {
    this.aes = new Aes256GcmService(encryptionKey);
  }

  encrypt(plaintext: string): string {
    return this.aes.encrypt(plaintext);
  }

  decrypt(ciphertext: string): string {
    return this.aes.decrypt(ciphertext);
  }
}
