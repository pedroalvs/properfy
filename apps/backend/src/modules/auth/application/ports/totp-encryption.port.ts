/**
 * Port for encrypting/decrypting TOTP secrets at rest. Use cases depend on this
 * interface, not on the concrete infrastructure implementation, keeping the
 * application layer free of infrastructure imports (Clean Architecture; #270,
 * #234). Implemented by `TotpEncryptionService` in the infrastructure layer.
 */
export interface ITotpEncryptionService {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}
