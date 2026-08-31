import { createRequire } from 'node:module';

import { env } from '../env';
import { DevEncryptionAdapter } from './dev-encryption-adapter';
import { ElectronEncryptionAdapter, type SafeStorage } from './electron-encryption-adapter';
import type { EncryptionPort } from './port';

export type { EncryptionPort } from './port';
export { DevEncryptionAdapter } from './dev-encryption-adapter';
export { ElectronEncryptionAdapter, type SafeStorage } from './electron-encryption-adapter';

/**
 * Picks the encryption adapter per `env.encryptionAdapter`, itself derived
 * from configuration (`ENCRYPTION_ADAPTER`, defaulting to whether the
 * process is Electron's main process) — so tests never touch the OS
 * keychain and `pnpm dev:api` never needs Electron running.
 */
export function createEncryptionPort(): EncryptionPort {
  if (env.encryptionAdapter === 'electron') {
    const require = createRequire(import.meta.url);
    const { safeStorage } = require('electron') as { safeStorage: SafeStorage };
    return new ElectronEncryptionAdapter(safeStorage);
  }

  return new DevEncryptionAdapter(env.devEncryptionKey);
}
