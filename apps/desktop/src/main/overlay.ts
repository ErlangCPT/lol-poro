import { BrowserWindow, globalShortcut, screen } from 'electron';
import { join } from 'node:path';
import type { AppSettings, OverlayBounds, OverlayStatus } from '@shared/ipc';
import type { GameWindowRect } from './game-window';
import type { Logger } from './logger';

export interface OverlayDeps {
  getSettings: () => AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  publish: (status: OverlayStatus) => void;
  onWindow: (win: BrowserWindow) => void;
  log: Logger;
}

export const OVERLAY_HOTKEYS = {
  interactive: 'CommandOrControl+Shift+O',
  toggle: 'CommandOrControl+Shift+P',
};
/** unscaled panel width in DIP; the window width follows overlayScale */
const BASE_WIDTH = 340;
const DEFAULT_HEIGHT = 560;
const MARGIN = 12;

/**
 * Transparent always-on-top window that shows the in-game panel. Click-through by default;
 * the hotkey (or the lock button in interactive mode) toggles mouse interaction so it can be moved.
 *
 * Placement: a manually dragged position is kept (settings.overlayBounds). Otherwise the overlay follows
 * the game window: beside it when the display has room (e.g. with LoL 27's shrunken game window),
 * else inside it at the left edge; without a game window in the top-right corner of the primary display.
 */
export class OverlayWindow {
  private win: BrowserWindow | null = null;
  private interactive = false;
  private wanted = false;
  private boundsTimer: NodeJS.Timeout | null = null;
  private topTimer: NodeJS.Timeout | null = null;
  private gameRect: GameWindowRect | null = null;
  private moving = false;
  private hotkeyError: string | undefined;

  constructor(private readonly deps: OverlayDeps) {}

  get window(): BrowserWindow | null {
    return this.win;
  }

  status(): OverlayStatus {
    return {
      enabled: this.deps.getSettings().overlayEnabled,
      visible: !!this.win && !this.win.isDestroyed() && this.win.isVisible(),
      interactive: this.interactive,
      hotkeys: this.hotkeys(),
      hotkeyError: this.hotkeyError,
    };
  }

  private publish(): void {
    this.deps.publish(this.status());
  }

  private width(): number {
    return Math.round(BASE_WIDTH * (this.deps.getSettings().overlayScale || 1));
  }

  private currentHeight(): number {
    return this.win && !this.win.isDestroyed() ? this.win.getBounds().height : DEFAULT_HEIGHT;
  }

  /** Automatic position: beside the game window when there is room, else inside at the left edge. */
  private autoBounds(): OverlayBounds {
    const width = this.width();
    const height = this.currentHeight();
    const game = this.gameRect;
    if (game) {
      const area = screen.getDisplayMatching(game).workArea;
      const rightFree = area.x + area.width - (game.x + game.width);
      const leftFree = game.x - area.x;
      const y = Math.max(area.y, Math.min(game.y + MARGIN, area.y + area.height - height));
      if (rightFree >= width + 2 * MARGIN) return { x: game.x + game.width + MARGIN, y, width, height };
      if (leftFree >= width + 2 * MARGIN) return { x: game.x - width - MARGIN, y, width, height };
      // inside the game window: left edge, below the top HUD
      return { x: game.x + MARGIN, y: game.y + Math.round(game.height * 0.22), width, height };
    }
    const area = screen.getPrimaryDisplay().workArea;
    return { x: area.x + area.width - width - 16, y: area.y + 90, width, height };
  }

  private targetBounds(): OverlayBounds {
    const saved = this.deps.getSettings().overlayBounds;
    if (saved && screen.getDisplayMatching(saved)) {
      return { ...saved, width: this.width(), height: this.currentHeight() };
    }
    return this.autoBounds();
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const bounds = this.targetBounds();
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      show: false,
      title: 'Poro Overlay',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('moved', () => {
      if (this.interactive && !this.moving) this.persistBounds();
    });
    win.on('closed', () => {
      this.win = null;
      this.publish();
    });
    this.deps.onWindow(win);
    if (process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/overlay.html'));
    }
    this.win = win;
    return win;
  }

  /** A drag by the user pins the overlay to that position until the position is reset. */
  private persistBounds(): void {
    if (this.boundsTimer) clearTimeout(this.boundsTimer);
    this.boundsTimer = setTimeout(() => {
      this.boundsTimer = null;
      if (!this.win || this.win.isDestroyed()) return;
      const b = this.win.getBounds();
      this.deps.updateSettings({ overlayBounds: { x: b.x, y: b.y, width: b.width, height: b.height } });
    }, 400);
  }

  private setBoundsQuiet(bounds: OverlayBounds): void {
    if (!this.win || this.win.isDestroyed()) return;
    const b = this.win.getBounds();
    if (b.x === bounds.x && b.y === bounds.y && b.width === bounds.width && b.height === bounds.height)
      return;
    this.moving = true;
    this.win.setBounds(bounds);
    setTimeout(() => (this.moving = false), 50);
  }

  /** Called by the game window tracker; repositions an automatically placed overlay. */
  follow(rect: GameWindowRect | null): void {
    const changed = JSON.stringify(rect) !== JSON.stringify(this.gameRect);
    this.gameRect = rect;
    if (changed && this.win && !this.win.isDestroyed() && !this.interactive) {
      this.setBoundsQuiet(this.targetBounds());
    }
  }

  private dragOrigin: { x: number; y: number } | null = null;

  beginDrag(): void {
    if (!this.win || this.win.isDestroyed() || !this.interactive) return;
    const b = this.win.getBounds();
    this.dragOrigin = { x: b.x, y: b.y };
  }

  dragTo(dx: number, dy: number): void {
    if (!this.win || this.win.isDestroyed() || !this.dragOrigin) return;
    const b = this.win.getBounds();
    this.moving = true;
    this.win.setBounds({
      ...b,
      x: Math.round(this.dragOrigin.x + dx),
      y: Math.round(this.dragOrigin.y + dy),
    });
  }

  endDrag(): void {
    if (!this.dragOrigin) return;
    this.dragOrigin = null;
    this.moving = false;
    this.persistBounds();
  }

  /** Fits the window to the rendered content (called by the overlay renderer). */
  resizeTo(height: number): void {
    if (!this.win || this.win.isDestroyed()) return;
    const area = screen.getDisplayMatching(this.win.getBounds()).workArea;
    const target = Math.max(80, Math.min(Math.ceil(height) + 2, area.height - 20));
    const b = this.win.getBounds();
    const width = this.width();
    if (Math.abs(b.height - target) >= 2 || b.width !== width) {
      this.setBoundsQuiet({ ...b, width, height: target });
    }
  }

  /** `wanted` = a game is running; the window shows when the overlay is enabled as well. */
  setWanted(wanted: boolean): void {
    this.wanted = wanted;
    this.apply();
  }

  /** Re-evaluates visibility and placement after a settings change. */
  apply(): void {
    const show = this.wanted && this.deps.getSettings().overlayEnabled;
    if (show) {
      const win = this.ensure();
      if (!this.interactive) this.setBoundsQuiet(this.targetBounds());
      if (!win.isVisible()) win.showInactive();
      this.startTopTimer();
    } else {
      this.stopTopTimer();
      if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
        this.win.hide();
        if (this.interactive) this.setInteractive(false);
      }
    }
    this.publish();
  }

  // Tools such as LoL 27 re-raise their own topmost windows every 250 ms; re-assert ours once a second
  // while the game has the focus so the overlay stays on top of them.
  private startTopTimer(): void {
    if (this.topTimer) return;
    this.topTimer = setInterval(() => {
      if (!this.win || this.win.isDestroyed() || !this.win.isVisible() || this.interactive) return;
      if (this.gameRect && !this.gameRect.foreground) return;
      this.win.setAlwaysOnTop(true, 'screen-saver');
    }, 1000);
  }

  private stopTopTimer(): void {
    if (this.topTimer) clearInterval(this.topTimer);
    this.topTimer = null;
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    if (this.win && !this.win.isDestroyed()) {
      if (interactive) {
        this.win.setIgnoreMouseEvents(false);
        this.win.focus();
      } else {
        this.win.setIgnoreMouseEvents(true, { forward: true });
        this.win.blur();
      }
    }
    this.publish();
  }

  toggleInteractive(): void {
    if (!this.win || !this.win.isVisible()) return;
    this.setInteractive(!this.interactive);
  }

  toggleEnabled(): void {
    this.deps.updateSettings({ overlayEnabled: !this.deps.getSettings().overlayEnabled });
    this.apply();
  }

  /** Hotkeys from the settings, falling back to the defaults for empty values. */
  private hotkeys(): { interactive: string; toggle: string } {
    const s = this.deps.getSettings();
    return {
      interactive: s.hotkeyInteractive?.trim() || OVERLAY_HOTKEYS.interactive,
      toggle: s.hotkeyToggle?.trim() || OVERLAY_HOTKEYS.toggle,
    };
  }

  /** (Re)registers the global shortcuts; a failed registration (invalid or taken) is reported in the status. */
  registerHotkeys(): void {
    globalShortcut.unregisterAll();
    const keys = this.hotkeys();
    const failed: string[] = [];
    const register = (accelerator: string, fn: () => void) => {
      try {
        if (!globalShortcut.register(accelerator, fn)) failed.push(accelerator);
      } catch {
        failed.push(accelerator);
      }
    };
    register(keys.interactive, () => this.toggleInteractive());
    if (keys.toggle !== keys.interactive) register(keys.toggle, () => this.toggleEnabled());
    else failed.push(keys.toggle);
    this.hotkeyError = failed.length ? failed.join(', ') : undefined;
    if (failed.length) this.deps.log.warn('overlay hotkeys could not be registered', failed);
    this.publish();
  }

  destroy(): void {
    this.stopTopTimer();
    globalShortcut.unregisterAll();
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
