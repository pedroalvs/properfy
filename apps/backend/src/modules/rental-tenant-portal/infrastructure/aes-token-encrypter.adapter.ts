import type { ITokenEncrypter } from '../domain/token-encrypter';
import type { Aes256GcmService } from '../../../shared/infrastructure/crypto/aes-256-gcm.service';

/** Adapts Aes256GcmService to the ITokenEncrypter port, keeping rental-tenant-portal domain pure. */
export class AesTokenEncrypterAdapter implements ITokenEncrypter {
  constructor(private readonly aes: Aes256GcmService) {}

  encrypt(plaintext: string): string {
    return this.aes.encrypt(plaintext);
  }

  decrypt(ciphertext: string): string {
    return this.aes.decrypt(ciphertext);
  }
}
