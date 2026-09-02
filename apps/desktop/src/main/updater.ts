import { app } from 'electron';
import type { UpdateStatus } from '@shared/ipc';
import type { Logger } from './logger';

export interface UpdaterDeps {
  /** generic feed URL (folder with latest.yml and the installer); empty = updates off */
  getUrl: () => string;
  publish: (status: UpdateStatus) => void;
  log: Logger;
}

type AutoUpdater = typeof import('electron-updater').autoUpdater;

/**
 * Auto-update via electron-updater's generic provider: the release folder (latest.yml, installer, blockmap)
 * is served from any HTTPS location, the URL comes from the settings. Downloads run in the background;
 * installing happens on quit or on request.
 */
export class UpdateService {
  private status: UpdateStatus;
  private updater: AutoUpdater | null = null;
  private wired = false;

  constructor(private readonly deps: UpdaterDeps) {
    this.status = { state: 'disabled', currentVersion: app.getVersion() };
  }

  current(): UpdateStatus {
    return this.status;
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.deps.publish(this.status);
  }

  private async load(): Promise<AutoUpdater | null> {
    if (this.updater) return this.updater;
    try {
      const mod = await import('electron-updater');
      const updater = mod.autoUpdater;
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      updater.logger = {
        info: (m: unknown) => this.deps.log.info('updater', String(m)),
        warn: (m: unknown) => this.deps.log.warn('updater', String(m)),
        error: (m: unknown) => this.deps.log.error('updater', String(m)),
        debug: () => undefined,
      };
      this.updater = updater;
      return updater;
    } catch (e) {
      this.deps.log.error('updater unavailable', e);
      return null;
    }
  }

  private wire(updater: AutoUpdater): void {
    if (this.wired) return;
    this.wired = true;
    updater.on('checking-for-update', () => this.set({ state: 'checking', message: undefined }));
    updater.on('update-available', (info) => this.set({ state: 'available', version: info.version }));
    updater.on('update-not-available', (info) =>
      this.set({ state: 'uptodate', version: info.version, checkedAt: Date.now() }),
    );
    updater.on('download-progress', (p) =>
      this.set({ state: 'downloading', progress: Math.round(p.percent) }),
    );
    updater.on('update-downloaded', (info) =>
      this.set({ state: 'downloaded', version: info.version, progress: 100 }),
    );
    updater.on('error', (err) => {
      this.deps.log.warn('update check failed', err.message);
      this.set({ state: 'error', message: err.message, checkedAt: Date.now() });
    });
  }

  /** Checks the configured feed; without URL or in development the check is a no-op with a hint. */
  async check(): Promise<UpdateStatus> {
    const url = this.deps.getUrl().trim();
    if (!url) {
      this.set({ state: 'disabled', message: undefined });
      return this.status;
    }
    if (!app.isPackaged) {
      this.set({ state: 'disabled', message: 'Updates are only checked in the installed app.' });
      return this.status;
    }
    const updater = await this.load();
    if (!updater) {
      this.set({ state: 'error', message: 'electron-updater not available' });
      return this.status;
    }
    this.wire(updater);
    try {
      updater.setFeedURL({ provider: 'generic', url });
      this.set({ state: 'checking', message: undefined });
      await updater.checkForUpdates();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.deps.log.warn('update check failed', message);
      this.set({ state: 'error', message, checkedAt: Date.now() });
    }
    return this.status;
  }

  /** Quits and installs a downloaded update. */
  install(): void {
    if (this.status.state !== 'downloaded' || !this.updater) return;
    this.deps.log.info('installing update', this.status.version);
    this.updater.quitAndInstall(false, true);
  }
}
