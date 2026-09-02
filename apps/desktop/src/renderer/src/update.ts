import type { UpdateStatus } from '@shared/ipc';
import { useEffect, useState } from 'react';

export const INITIAL_UPDATE: UpdateStatus = { state: 'disabled', currentVersion: '' };

/** Current auto-update status, kept in sync with the main process. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL_UPDATE);
  useEffect(() => {
    void window.poro.getUpdate().then(setStatus);
    return window.poro.onUpdate(setStatus);
  }, []);
  return status;
}

/** Human readable update state. */
export function updateLabel(u: UpdateStatus, de: boolean): string {
  switch (u.state) {
    case 'disabled':
      return u.message ?? (de ? 'Keine Update-Quelle eingetragen' : 'No update source configured');
    case 'idle':
      return de ? 'Noch nicht geprüft' : 'Not checked yet';
    case 'checking':
      return de ? 'Prüfe…' : 'Checking…';
    case 'available':
      return de
        ? `Version ${u.version} gefunden, lade herunter…`
        : `Version ${u.version} found, downloading…`;
    case 'downloading':
      return de
        ? `Lade Version ${u.version}: ${u.progress ?? 0} %`
        : `Downloading ${u.version}: ${u.progress ?? 0}%`;
    case 'downloaded':
      return de
        ? `Version ${u.version} ist bereit; wird beim nächsten Beenden installiert.`
        : `Version ${u.version} is ready; installs on next quit.`;
    case 'uptodate':
      return de ? `Aktuell (${u.currentVersion})` : `Up to date (${u.currentVersion})`;
    case 'error':
      return `${de ? 'Fehler' : 'Error'}: ${u.message ?? ''}`;
  }
}
