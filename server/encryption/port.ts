/**
 * Seam through which a professor's senha is encrypted before storage and
 * decrypted when needed. Electron uses the OS keychain; the controlled
 * API uses a separate server key. A development adapter supports local
 * fixtures and the one-time import of earlier development databases.
 */
export interface EncryptionPort {
  encrypt(plainText: string): Promise<Buffer>;
  /**
   * @throws {Error} when `cipherText` is corrupted, unreadable, or was not
   * produced by this adapter's key — never returns garbage.
   */
  decrypt(cipherText: Buffer): Promise<string>;
}
