/** Port keeping tenant-portal domain free of node:crypto imports. */
export interface ITokenEncrypter {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
