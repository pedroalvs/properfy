import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Stateless AES-256-GCM encryption helper. Key must be 32 bytes (64 hex or 44 base64 chars). */
export class Aes256GcmService {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    let key = Buffer.from(encryptionKey, 'hex');
    if (key.length !== 32) {
      key = Buffer.from(encryptionKey, 'base64');
    }
    if (key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (64 hex chars or 44 base64 chars)');
    }
    this.key = key;
  }

  /** Returns base64(iv ‖ authTag ‖ ciphertext). */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
