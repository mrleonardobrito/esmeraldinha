import { describe, expect, it } from 'vitest';

import { DevEncryptionAdapter } from '../dev-encryption-adapter';

describe('DevEncryptionAdapter', () => {
  it('round-trips a senha unchanged', async () => {
    const adapter = new DevEncryptionAdapter('chave-de-teste');

    const cipherText = await adapter.encrypt('minha-senha-secreta');

    await expect(adapter.decrypt(cipherText)).resolves.toBe(
      'minha-senha-secreta',
    );
  });

  it('never stores the plaintext senha inside the ciphertext', async () => {
    const adapter = new DevEncryptionAdapter('chave-de-teste');

    const cipherText = await adapter.encrypt('minha-senha-secreta');

    expect(cipherText.toString('utf8')).not.toContain('minha-senha-secreta');
  });

  it('raises an explicit error when decrypting corrupted input', async () => {
    const adapter = new DevEncryptionAdapter('chave-de-teste');

    const cipherText = await adapter.encrypt('minha-senha-secreta');
    cipherText[cipherText.length - 1] = (cipherText[cipherText.length - 1] ?? 0) ^ 0xff;

    await expect(adapter.decrypt(cipherText)).rejects.toThrow(
      /falha ao decifrar/i,
    );
  });

  it('raises when decrypting unreadable input', async () => {
    const adapter = new DevEncryptionAdapter('chave-de-teste');

    await expect(adapter.decrypt(Buffer.from('garbage'))).rejects.toThrow(
      /falha ao decifrar/i,
    );
  });

  it('requires a development key', () => {
    expect(() => new DevEncryptionAdapter('')).toThrow(
      /ESMERALDINHA_ENCRYPTION_KEY/,
    );
  });
});
