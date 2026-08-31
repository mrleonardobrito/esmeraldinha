import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: () => (id: string) => {
      if (id === 'electron') return { app: { isPackaged: true } };
      return actual.createRequire(import.meta.url)(id);
    },
  };
});

describe('DevEncryptionAdapter in a packaged Electron build', () => {
  const originalElectronVersion = process.versions.electron;

  afterEach(() => {
    if (originalElectronVersion === undefined) {
      delete (process.versions as Record<string, string | undefined>).electron;
    } else {
      (process.versions as Record<string, string>).electron = originalElectronVersion;
    }
    vi.resetModules();
  });

  it('refuses to run', async () => {
    (process.versions as Record<string, string>).electron = '38.0.0';

    const { DevEncryptionAdapter } = await import('../dev-encryption-adapter');

    expect(() => new DevEncryptionAdapter('chave-de-teste')).toThrow(
      /build empacotada do Electron/,
    );
  });
});
