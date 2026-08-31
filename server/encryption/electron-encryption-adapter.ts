import type { EncryptionPort } from './port';

/** The subset of Electron's `safeStorage` this adapter needs. */
export interface SafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(cipherText: Buffer): string;
}

/**
 * Electron adapter: keys off the OS keychain via `safeStorage`. Used
 * whenever the server runs inside the Electron main process, packaged or
 * not — unlike the dev adapter, this one has no packaged-build restriction.
 */
export class ElectronEncryptionAdapter implements EncryptionPort {
  constructor(private readonly safeStorage: SafeStorage) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'safeStorage não está disponível: o keychain do sistema operacional não pôde ser acessado.',
      );
    }
  }

  async encrypt(plainText: string): Promise<Buffer> {
    return this.safeStorage.encryptString(plainText);
  }

  async decrypt(cipherText: Buffer): Promise<string> {
    try {
      return this.safeStorage.decryptString(cipherText);
    } catch (error) {
      throw new Error(
        'Falha ao decifrar a senha: dado corrompido ou chave incorreta.',
        { cause: error },
      );
    }
  }
}
