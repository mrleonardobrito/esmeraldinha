import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptionPort } from './port';

const header = Buffer.from('ESM1');
const context = Buffer.from('esmeraldinha:encrypted-data:v1');

/** At-rest encryption for the controlled API; its key is never distributed. */
export class ServerEncryptionAdapter implements EncryptionPort {
  private readonly key: Buffer;
  constructor(encodedKey: string) {
    if (process.versions.electron)
      throw new Error('Server encryption keys do not belong in Electron.');
    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== encodedKey)
      throw new Error(
        'SERVER_ENCRYPTION_KEY must contain exactly 32 random bytes encoded as base64.',
      );
  }
  async encrypt(plainText: string): Promise<Buffer> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(context);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([header, iv, cipher.getAuthTag(), encrypted]);
  }
  async decrypt(cipherText: Buffer): Promise<string> {
    try {
      if (!cipherText.subarray(0, 4).equals(header))
        throw new Error('Unknown envelope.');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        cipherText.subarray(4, 16),
      );
      decipher.setAAD(context);
      decipher.setAuthTag(cipherText.subarray(16, 32));
      return Buffer.concat([
        decipher.update(cipherText.subarray(32)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(
        'The encrypted data is corrupted or uses a different server key.',
      );
    }
  }
}
