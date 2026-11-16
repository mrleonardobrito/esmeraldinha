import { describe, expect, it, vi } from 'vitest';

import { startUpdates } from '../updates';

function criarAtualizador() {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
  };
}

describe('startUpdates', () => {
  it('does not check for updates while developing', async () => {
    const atualizador = criarAtualizador();

    startUpdates({
      packagedApp: false,
      updater: atualizador,
      onError: vi.fn(),
    });

    await Promise.resolve();

    expect(atualizador.checkForUpdates).not.toHaveBeenCalled();
    expect(atualizador.autoDownload).toBe(false);
  });

  it('downloads a packaged update and installs it on normal quit', async () => {
    const atualizador = criarAtualizador();

    startUpdates({
      packagedApp: true,
      updater: atualizador,
      onError: vi.fn(),
    });

    await Promise.resolve();

    expect(atualizador.autoDownload).toBe(true);
    expect(atualizador.autoInstallOnAppQuit).toBe(true);
    expect(atualizador.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('records a failed update check without throwing', async () => {
    const erro = new Error('offline');
    const atualizador = criarAtualizador();
    atualizador.checkForUpdates.mockRejectedValueOnce(erro);
    const registrarErro = vi.fn();

    startUpdates({
      packagedApp: true,
      updater: atualizador,
      onError: registrarErro,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(registrarErro).toHaveBeenCalledWith(erro);
  });
});
