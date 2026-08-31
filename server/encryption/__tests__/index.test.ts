import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createEncryptionPort', () => {
  const originalAdapter = process.env.ENCRYPTION_ADAPTER;
  const originalKey = process.env.DEV_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.ENCRYPTION_ADAPTER = originalAdapter;
    process.env.DEV_ENCRYPTION_KEY = originalKey;
    vi.resetModules();
  });

  it('picks the dev adapter outside Electron, never touching the OS keychain', async () => {
    process.env.ENCRYPTION_ADAPTER = 'dev';
    process.env.DEV_ENCRYPTION_KEY = 'chave-de-teste';
    vi.resetModules();

    const { DevEncryptionAdapter } = await import('../dev-encryption-adapter');
    const { createEncryptionPort } = await import('../index');

    expect(createEncryptionPort()).toBeInstanceOf(DevEncryptionAdapter);
  });
});
