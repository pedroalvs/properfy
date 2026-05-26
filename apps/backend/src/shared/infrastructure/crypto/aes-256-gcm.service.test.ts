import { describe, it, expect } from 'vitest';
import { Aes256GcmService } from './aes-256-gcm.service';

const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes as hex

describe('Aes256GcmService', () => {
  it('should encrypt and decrypt a round-trip correctly', () => {
    const svc = new Aes256GcmService(VALID_KEY_HEX);
    const plaintext = 'hello-portal-token-abc123';
    const ciphertext = svc.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(svc.decrypt(ciphertext)).toBe(plaintext);
  });

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const svc = new Aes256GcmService(VALID_KEY_HEX);
    const c1 = svc.encrypt('same');
    const c2 = svc.encrypt('same');
    expect(c1).not.toBe(c2);
  });

  it('should throw when key is too short', () => {
    expect(() => new Aes256GcmService('deadbeef')).toThrow();
  });

  it('should throw when decrypting tampered ciphertext', () => {
    const svc = new Aes256GcmService(VALID_KEY_HEX);
    const ciphertext = svc.encrypt('sensitive');
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    expect(() => svc.decrypt(tampered.toString('base64'))).toThrow();
  });
});
