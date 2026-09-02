import { app, crashReporter } from 'electron';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './logger';

export interface CrashReport {
  at: string;
  version: string;
  platform: string;
  source: 'main' | 'renderer' | 'overlay' | 'process';
  kind: string;
  message: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

/**
 * Local crash reporting: uncaught errors of the main process, renderer errors reported over IPC and
 * gone processes are written as JSON files to `userData/crashes`. Nothing is uploaded; native minidumps
 * of Chromium go to Electron's crashDumps directory with uploads disabled.
 */
export class CrashReporter {
  readonly dir: string;

  constructor(
    userData: string,
    private readonly log: Logger,
  ) {
    this.dir = join(userData, 'crashes');
  }

  install(): void {
    mkdirSync(this.dir, { recursive: true });
    try {
      crashReporter.start({ uploadToServer: false, submitURL: '', compress: true });
    } catch (e) {
      this.log.warn('crash reporter not started', e);
    }
    process.on('uncaughtException', (err) => {
      this.write({ source: 'main', kind: 'uncaughtException', message: err.message, stack: err.stack });
      this.log.error('uncaught exception', err);
    });
    process.on('unhandledRejection', (reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.write({ source: 'main', kind: 'unhandledRejection', message: err.message, stack: err.stack });
      this.log.error('unhandled rejection', err);
    });
    app.on('render-process-gone', (_e, contents, details) => {
      if (details.reason === 'clean-exit' || details.reason === 'killed') return;
      this.write({
        source: contents.getTitle() === 'Poro Overlay' ? 'overlay' : 'renderer',
        kind: 'render-process-gone',
        message: `${details.reason} (exit code ${details.exitCode})`,
      });
      this.log.error('renderer gone', details.reason, details.exitCode);
    });
    app.on('child-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit' || details.reason === 'killed') return;
      this.write({
        source: 'process',
        kind: `child-process-gone:${details.type}`,
        message: `${details.reason} (exit code ${details.exitCode}) ${details.name ?? ''}`.trim(),
      });
      this.log.error('child process gone', details.type, details.reason);
    });
  }

  /** Errors the renderer reports over IPC (window.onerror, unhandled promise rejections). */
  fromRenderer(source: 'renderer' | 'overlay', kind: string, message: string, stack?: string): void {
    this.write({ source, kind, message, stack });
    this.log.error(`${source} error`, message);
  }

  write(report: Omit<CrashReport, 'at' | 'version' | 'platform'>): void {
    const full: CrashReport = {
      at: new Date().toISOString(),
      version: app.getVersion(),
      platform: `${process.platform} ${process.arch}`,
      ...report,
    };
    try {
      mkdirSync(this.dir, { recursive: true });
      const name = `crash-${full.at.replace(/[:.]/g, '-')}-${report.source}.json`;
      writeFileSync(join(this.dir, name), JSON.stringify(full, null, 2));
      this.prune();
    } catch {
      // never fail because of crash reporting
    }
  }

  count(): number {
    try {
      return existsSync(this.dir) ? readdirSync(this.dir).filter((f) => f.endsWith('.json')).length : 0;
    } catch {
      return 0;
    }
  }

  /** Keeps the newest 50 reports. */
  private prune(): void {
    const files = readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - 50))) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').unlinkSync(join(this.dir, f));
      } catch {
        // ignore
      }
    }
  }
}
