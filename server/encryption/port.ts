/**
 * Seam through which a professor's senha is encrypted before storage and
 * decrypted when needed. Two adapters implement this port: one keyed off
 * the OS keychain under Electron, one keyed off a development env var
 * everywhere else (see `dev-encryption-adapter.ts` and
 * `electron-encryption-adapter.ts`).
 */
export interface EncryptionPort {
  encrypt(plainText: string): Promise<Buffer>;
  /**
   * @throws {Error} when `cipherText` is corrupted, unreadable, or was not
   * produced by this adapter's key — never returns garbage.
   */
  decrypt(cipherText: Buffer): Promise<string>;
}
