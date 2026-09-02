import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { screen } from 'electron';
import type { Logger } from './logger';

/** Position of the League game window in Electron DIP coordinates. */
export interface GameWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** the game window is the foreground window */
  foreground: boolean;
}

export interface GameWindowEvents {
  /** null when no game window exists */
  rect: [rect: GameWindowRect | null];
}

// One long-running PowerShell process reports the game window every 500 ms as a JSON line.
// DPI awareness is enabled so GetWindowRect returns physical pixels, converted to DIP here.
const HELPER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PoroWin {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}
"@
[void][PoroWin]::SetProcessDpiAwarenessContext([IntPtr](-4))
$last = ''
while ($true) {
  $h = [PoroWin]::FindWindowW('RiotWindowClass', 'League of Legends (TM) Client')
  if ($h -eq [IntPtr]::Zero) { $h = [PoroWin]::FindWindowW($null, 'League of Legends (TM) Client') }
  $line = '{"found":false}'
  if ($h -ne [IntPtr]::Zero -and [PoroWin]::IsWindowVisible($h)) {
    $r = New-Object PoroWin+RECT
    if ([PoroWin]::GetWindowRect($h, [ref]$r)) {
      $fg = if ([PoroWin]::GetForegroundWindow() -eq $h) { 'true' } else { 'false' }
      $line = '{"found":true,"x":' + $r.L + ',"y":' + $r.T + ',"w":' + ($r.R - $r.L) + ',"h":' + ($r.B - $r.T) + ',"fg":' + $fg + '}'
    }
  }
  if ($line -ne $last) { Write-Output $line; $last = $line }
  Start-Sleep -Milliseconds 500
}
`;

/**
 * Tracks the League game window ("League of Legends (TM) Client") so the overlay can follow it.
 * Also works when a tool such as LoL 27 moves and shrinks the game window. Windows only.
 */
export class GameWindowTracker extends EventEmitter<GameWindowEvents> {
  private child: ChildProcess | null = null;
  private buffer = '';
  private current: GameWindowRect | null = null;
  private active = false;

  constructor(private readonly log: Logger) {
    super();
  }

  get rect(): GameWindowRect | null {
    return this.current;
  }

  /** Runs the helper only while a game is running. */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.child || process.platform !== 'win32') return;
    try {
      const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64');
      this.child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      this.child.stdout?.setEncoding('utf8');
      this.child.stdout?.on('data', (chunk: string) => this.onData(chunk));
      this.child.on('exit', (code) => {
        this.child = null;
        if (this.active) this.log.warn('game window helper exited', code);
        this.update(null);
      });
    } catch (e) {
      this.log.warn('game window helper failed to start', e);
      this.child = null;
    }
  }

  private stop(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.buffer = '';
    this.update(null);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.startsWith('{')) continue;
      try {
        const msg = JSON.parse(line) as {
          found: boolean;
          x?: number;
          y?: number;
          w?: number;
          h?: number;
          fg?: boolean;
        };
        if (!msg.found || msg.w === undefined || msg.h === undefined) {
          this.update(null);
          continue;
        }
        const dip = screen.screenToDipRect(null, {
          x: msg.x ?? 0,
          y: msg.y ?? 0,
          width: msg.w,
          height: msg.h,
        });
        this.update({ ...dip, foreground: !!msg.fg });
      } catch {
        // ignore malformed line
      }
    }
  }

  private update(rect: GameWindowRect | null): void {
    const before = JSON.stringify(this.current);
    this.current = rect;
    if (before !== JSON.stringify(rect)) this.emit('rect', rect);
  }
}
