import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LcuCredentials } from './types';

const DEFAULT_LOCKFILES = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  '/Applications/League of Legends.app/Contents/LoL/lockfile',
];

/** Parses the content of the LCU lockfile: name:pid:port:password:protocol */
export function parseLockfile(content: string): LcuCredentials | null {
  const parts = content.trim().split(':');
  if (parts.length < 5) return null;
  const port = Number(parts[2]);
  const password = parts[3];
  if (!Number.isFinite(port) || !password) return null;
  return { port, password, pid: Number(parts[1]) || undefined, protocol: 'https' };
}

/** Parses the LeagueClientUx command line: --app-port=... --remoting-auth-token=... */
export function parseCommandLine(cmd: string): LcuCredentials | null {
  const port = /--app-port[=\s]"?(\d+)/.exec(cmd)?.[1];
  const token = /--remoting-auth-token[=\s]"?([\w-]+)/.exec(cmd)?.[1];
  if (!port || !token) return null;
  return { port: Number(port), password: token, protocol: 'https' };
}

/** True when a process with the given PID exists (unknown PID counts as alive, it cannot be verified). */
export function isProcessAlive(pid: number | undefined): boolean {
  if (!pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function installDirectoryFromCommandLine(cmd: string): string | null {
  const m = /--install-directory=(?:"([^"]+)"|(\S+))/.exec(cmd);
  return m?.[1] ?? m?.[2] ?? null;
}

function run(cmd: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

async function readProcessCommandLine(): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const out = await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name=\'LeagueClientUx.exe\'" | Select-Object -ExpandProperty CommandLine',
      ]);
      const line = out.trim();
      return line.length > 0 ? line : null;
    }
    const out = await run('ps', ['-A', '-o', 'args=']);
    const line = out.split('\n').find((l) => l.includes('LeagueClientUx') && l.includes('--app-port'));
    return line ?? null;
  } catch {
    return null;
  }
}

/**
 * Finds LCU credentials. Prefers the running process command line (works regardless of install path),
 * falls back to the lockfile in the install directory or default locations.
 */
export async function findLcuCredentials(extraLockfilePaths: string[] = []): Promise<LcuCredentials | null> {
  const cmd = await readProcessCommandLine();
  if (cmd) {
    const creds = parseCommandLine(cmd);
    if (creds) return creds;
    const dir = installDirectoryFromCommandLine(cmd);
    if (dir) extraLockfilePaths = [join(dir, 'lockfile'), ...extraLockfilePaths];
  }
  for (const path of [...extraLockfilePaths, ...DEFAULT_LOCKFILES]) {
    try {
      if (!existsSync(path)) continue;
      const creds = parseLockfile(readFileSync(path, 'utf8'));
      // A lockfile survives client crashes; ignore it when its process is gone.
      if (creds && isProcessAlive(creds.pid)) return creds;
    } catch {
      // locked or unreadable; try next
    }
  }
  return null;
}

const DEFAULT_INSTALL_DIRS = ['C:\Riot Games\League of Legends', 'D:\Riot Games\League of Legends'];

/** League install directory from the running client, falling back to the default locations. */
export async function findLeagueInstallDir(): Promise<string | null> {
  const cmd = await readProcessCommandLine();
  const fromCmd = cmd ? installDirectoryFromCommandLine(cmd) : null;
  if (fromCmd && existsSync(fromCmd)) return fromCmd;
  return DEFAULT_INSTALL_DIRS.find((d) => existsSync(d)) ?? null;
}

export type GameWindowMode = 'fullscreen' | 'windowed' | 'borderless';

/** Reads WindowMode from Config/game.cfg (0 = fullscreen, 1 = windowed, 2 = borderless). */
export function readGameWindowMode(installDir: string): GameWindowMode | null {
  try {
    const cfg = readFileSync(join(installDir, 'Config', 'game.cfg'), 'utf8');
    const m = /^\s*WindowMode\s*=\s*(\d)/m.exec(cfg);
    if (!m) return null;
    return m[1] === '0' ? 'fullscreen' : m[1] === '2' ? 'borderless' : 'windowed';
  } catch {
    return null;
  }
}
