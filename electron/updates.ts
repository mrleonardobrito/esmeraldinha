export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
}

interface UpdateOptions {
  packagedApp: boolean;
  updater: Updater;
  onError(error: unknown): void;
}

/**
 * Checks for updates only in a distributed application. The installer is
 * prepared in the background and electron-updater applies it on the next
 * normal exit, without interrupting work on a caderneta.
 */
export function startUpdates({
  packagedApp,
  updater,
  onError,
}: UpdateOptions): void {
  if (!packagedApp) return;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  void updater.checkForUpdates().catch(onError);
}
