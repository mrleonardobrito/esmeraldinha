import { describe, expect, it, vi } from 'vitest';

import { ElectronEncryptionAdapter, type SafeStorage } from '../electron-encryption-adapter';

function fakeSafeStorage(overrides: Partial<SafeStorage> = {}): SafeStorage {
  const store = new Map<string, string>();

  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText) => {
      const cipherText = Buffer.from(`enc:${plainText}`, 'utf8');
      store.set(cipherText.toString('base64'), plainText);
      return cipherText;
    },
    decryptString: (cipherText) => {
      const plainText = store.get(cipherText.toString('base64'));
      if (plainText === undefined) throw new Error('unknown ciphertext');
      return plainText;
    },
    ...overrides,
  };
}

describe('ElectronEncryptionAdapter', () => {
  it('round-trips a senha unchanged', async () => {
    const adapter = new ElectronEncryptionAdapter(fakeSafeStorage());

    const cipherText = await adapter.encrypt('minha-senha-secreta');

    await expect(adapter.decrypt(cipherText)).resolves.toBe(
      'minha-senha-secreta',
    );
  });

  it('raises an explicit error when decrypting corrupted input', async () => {
    const adapter = new ElectronEncryptionAdapter(fakeSafeStorage());

    await expect(adapter.decrypt(Buffer.from('garbage'))).rejects.toThrow(
      /falha ao decifrar/i,
    );
  });

  it('refuses to construct when the OS keychain is unavailable', () => {
    const safeStorage = fakeSafeStorage({
      isEncryptionAvailable: () => false,
    });

    expect(() => new ElectronEncryptionAdapter(safeStorage)).toThrow(
      /safeStorage não está disponível/,
    );
  });

  it('does not swallow the original decrypt error', async () => {
    const safeStorage = fakeSafeStorage();
    const adapter = new ElectronEncryptionAdapter(safeStorage);
    const original = new Error('boom');
    vi.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
      throw original;
    });

    await expect(adapter.decrypt(Buffer.from('x'))).rejects.toMatchObject({
      cause: original,
    });
  });
});
