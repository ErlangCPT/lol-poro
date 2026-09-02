import { useEffect, useRef } from 'react';
import { liveGameTime, useLiveData, useNow } from '../hooks';
import { IconLock } from './icons';
import { LiveGamePanel } from './LiveGamePanel';

const ALERT_SECONDS = [60, 30];

let audio: AudioContext | null = null;
function beep(times: number): void {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      const start = ctx.currentTime + i * 0.22;
      osc.start(start);
      osc.stop(start + 0.14);
    }
  } catch {
    // no audio device
  }
}

/** Root of the transparent overlay window. */
export function OverlayApp() {
  const { live, overlay, settings, staticData } = useLiveData();
  const now = useNow();
  const de = settings.locale === 'de';
  const announced = useRef(new Set<string>());
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the window height in sync with the rendered content.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // The root's bottom edge, not the document height: the latter never drops below the viewport,
    // so the window could grow but never shrink back.
    const report = () => void window.poro.setOverlaySize(Math.ceil(el.getBoundingClientRect().bottom));
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [settings.overlayScale]);

  // Sound alerts 60 s and 30 s before an objective spawns (opt-in).
  useEffect(() => {
    if (!settings.overlaySound || !live.connected) return;
    const gameTime = liveGameTime(live, now);
    for (const o of live.objectives) {
      if (o.spawnAt === undefined || o.kind === 'inhibitor') continue;
      const left = o.spawnAt - gameTime;
      for (const s of ALERT_SECONDS) {
        const key = `${o.id}-${o.spawnAt}-${s}`;
        if (left <= s && left > s - 2 && !announced.current.has(key)) {
          announced.current.add(key);
          beep(s === 60 ? 1 : 2);
        }
      }
    }
  }, [now, live, settings.overlaySound]);

  // Manual drag: transparent frameless windows do not reliably honour CSS drag regions on Windows.
  const onBarMouseDown = (e: React.MouseEvent) => {
    if (!overlay.interactive || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.screenX;
    const startY = e.screenY;
    let frame = 0;
    void window.poro.overlayDragStart();
    const move = (ev: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        window.poro.overlayDrag(ev.screenX - startX, ev.screenY - startY);
      });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      void window.poro.overlayDragEnd();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const style = { opacity: settings.overlayOpacity, zoom: settings.overlayScale } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`overlay-root ${overlay.interactive ? 'overlay-interactive' : ''}`}
      style={style}
    >
      <div className="overlay-bar" onMouseDown={onBarMouseDown}>
        <span className="brand-mark brand-mark-sm">P</span>
        <span className="overlay-title">Poro</span>
        <span className="muted small overlay-hint">
          {overlay.interactive
            ? de
              ? 'Ziehen zum Verschieben'
              : 'drag to move'
            : `${overlay.hotkeys.interactive.replace('CommandOrControl', 'Ctrl')} ${de ? '= entsperren' : '= unlock'}`}
        </span>
        {overlay.interactive && (
          <button
            type="button"
            className="btn btn-sm overlay-lock"
            onClick={() => void window.poro.setOverlayInteractive(false)}
            title={de ? 'Fixieren' : 'Lock'}
            aria-label={de ? 'Fixieren' : 'Lock'}
          >
            <IconLock size={13} />
          </button>
        )}
      </div>
      {live.connected ? (
        <LiveGamePanel
          live={live}
          sd={staticData}
          locale={settings.locale}
          compact
          showPlayers={settings.overlayShowPlayers}
          showJungle={settings.overlayShowJungle}
          interactive={overlay.interactive}
        />
      ) : (
        <div className="overlay-idle muted">
          {de ? 'Warte auf ein laufendes Spiel…' : 'Waiting for a running game…'}
        </div>
      )}
    </div>
  );
}
