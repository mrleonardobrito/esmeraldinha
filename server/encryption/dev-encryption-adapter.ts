import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

import { requireElectron } from './require-electron';
import type { EncryptionPort } from './port';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_SALT = 'esmeraldinha-dev-encryption';

/**
 * True only inside an Electron process whose build is packaged. Outside
 * Electron (plain Node/tsx, tests) this is always false, since there is no
 * packaged build to speak of.
 */
function isPackagedElectronBuild(): boolean {
  if (!process.versions.electron) return false;

  const { app } = requireElectron();
  return app.isPackaged;
}

/**
 * Development adapter: keys off `ESMERALDINHA_ENCRYPTION_KEY` instead of the OS
 * keychain. This is a deliberate weakening for `pnpm dev:api` and tests,
 * and it refuses to run inside a packaged Electron build so the weakening
 * can never silently reach a real install.
 */
export class DevEncryptionAdapter implements EncryptionPort {
  private readonly key: Buffer;

  constructor(devKey: string) {
    if (isPackagedElectronBuild()) {
      throw new Error(
        'DevEncryptionAdapter não pode ser usado em uma build empacotada do Electron; use ElectronEncryptionAdapter.',
      );
    }
    if (!devKey) {
      throw new Error(
        'ESMERALDINHA_ENCRYPTION_KEY não configurada: necessária fora do Electron.',
      );
    }

    this.key = scryptSync(devKey, KEY_SALT, 32);
  }

  async encrypt(plainText: string): Promise<Buffer> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  async decrypt(cipherText: Buffer): Promise<string> {
    try {
      const iv = cipherText.subarray(0, IV_LENGTH);
      const authTag = cipherText.subarray(
        IV_LENGTH,
        IV_LENGTH + AUTH_TAG_LENGTH,
      );
      const encrypted = cipherText.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new Error(
        'Falha ao decifrar a senha: dado corrompido ou chave incorreta.',
        { cause: error },
      );
    }
  }
}
