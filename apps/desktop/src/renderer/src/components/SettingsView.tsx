import { DEFAULT_HOTKEYS, type AppSettings, type ConnectionState, type OverlayStatus } from '@shared/ipc';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { updateLabel, useUpdateStatus } from '../update';
import { IconDownload, IconFolder, IconRefresh } from './icons';
import { Card, PageHeader } from './ui';

const hotkey = (s: string) => s.replace('CommandOrControl', 'Ctrl');

/** One setting: label and hint on the left, the control on the right. */
function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="srow">
      <span className="srow-text">
        <span>{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <span className="srow-ctl">{children}</span>
    </label>
  );
}

function Section({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <Card className="settings-card" pad={false}>
      <header className="card-head">
        <span className="card-title">{title}</span>
      </header>
      {intro && <p className="muted small settings-intro">{intro}</p>}
      <div className="srows">{children}</div>
    </Card>
  );
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);
const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  '+': 'Plus',
};

/** Turns a key press into an Electron accelerator; undefined when it has no modifier or no real key. */
function acceleratorFromEvent(e: KeyboardEvent<HTMLInputElement>): string | undefined {
  if (MODIFIER_KEYS.has(e.key)) return undefined;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (mods.length === 0) return undefined;
  let key = e.key;
  const named = NAMED_KEYS[key];
  if (key.length === 1) key = key.toUpperCase();
  else if (named) key = named;
  else if (!/^(F\d{1,2}|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown)$/.test(key))
    return undefined;
  return [...mods, key].join('+');
}

/** Click, then press the combination; Escape keeps the old value, Backspace restores the default. */
function HotkeyInput({
  value,
  fallback,
  onChange,
  de,
}: {
  value: string;
  fallback: string;
  onChange: (accelerator: string) => void;
  de: boolean;
}) {
  const [recording, setRecording] = useState(false);
  return (
    <input
      type="text"
      className="hotkey-input"
      readOnly
      value={recording ? (de ? 'Tasten drücken…' : 'Press keys…') : hotkey(value || fallback)}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        e.preventDefault();
        if (e.key === 'Escape') {
          e.currentTarget.blur();
          return;
        }
        if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          onChange(fallback);
          e.currentTarget.blur();
          return;
        }
        const acc = acceleratorFromEvent(e);
        if (acc) {
          onChange(acc);
          e.currentTarget.blur();
        }
      }}
      title={
        de
          ? 'Klicken und Kombination drücken (Esc bricht ab, Rücktaste = Standard)'
          : 'Click and press the combination (Esc cancels, Backspace = default)'
      }
    />
  );
}

export function SettingsView({
  settings,
  overlay,
  state,
  update,
}: {
  settings: AppSettings;
  overlay: OverlayStatus;
  state?: ConnectionState;
  update: (p: Partial<AppSettings>) => Promise<void>;
}) {
  const de = settings.locale === 'de';
  const updateStatus = useUpdateStatus();
  const [ioMessage, setIoMessage] = useState<string | undefined>();
  const [prosCount, setProsCount] = useState<number | undefined>();
  const toggle = (key: keyof AppSettings) => (
    <input
      type="checkbox"
      className="switch"
      checked={!!settings[key]}
      onChange={(e) => void update({ [key]: e.target.checked })}
    />
  );
  const busyUpdate = updateStatus.state === 'checking' || updateStatus.state === 'downloading';

  return (
    <>
      <PageHeader title={de ? 'Einstellungen' : 'Settings'} state={state} locale={settings.locale} />
      <div className="page-main settings">
        <Section title={de ? 'Allgemein' : 'General'}>
          <Row
            label={de ? 'Sprache' : 'Language'}
            hint={
              de
                ? 'Champion-Namen aus Data Dragon folgen nach einem Neustart.'
                : 'Champion names from Data Dragon follow after a restart.'
            }
          >
            <select
              value={settings.locale}
              onChange={(e) => void update({ locale: e.target.value as AppSettings['locale'] })}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Row>
          <Row
            label={de ? 'Darstellung' : 'Appearance'}
            hint={de ? 'Das Overlay bleibt immer dunkel.' : 'The overlay always stays dark.'}
          >
            <select
              value={settings.theme}
              onChange={(e) => void update({ theme: e.target.value as AppSettings['theme'] })}
            >
              <option value="dark">{de ? 'Dunkel' : 'Dark'}</option>
              <option value="light">{de ? 'Hell' : 'Light'}</option>
              <option value="system">{de ? 'Wie Windows' : 'Follow Windows'}</option>
            </select>
          </Row>
          <Row label={de ? 'Spiel automatisch annehmen' : 'Auto-accept ready check'}>
            {toggle('autoAcceptReadyCheck')}
          </Row>
        </Section>

        <Section title={de ? 'Lobby-Analyse' : 'Lobby analysis'}>
          <Row label={de ? 'Statistik-Zeitraum (Tage)' : 'Statistics window (days)'}>
            <input
              type="number"
              min={7}
              max={90}
              value={settings.windowDays}
              onChange={(e) =>
                void update({ windowDays: Math.max(7, Math.min(90, Number(e.target.value) || 30)) })
              }
            />
          </Row>
          <Row label={de ? 'Nur Ranked-Spiele auswerten' : 'Ranked games only'}>{toggle('rankedOnly')}</Row>
          <Row
            label={de ? 'Detaildaten laden' : 'Load full game data'}
            hint={
              de
                ? 'Kill-Beteiligung, Lane-Gegner und Stomper-Tag; verlängert die Ladezeit im Champion Select.'
                : 'Kill participation, lane opponents and the stomper tag; increases loading time in champion select.'
            }
          >
            {toggle('fetchFullGames')}
          </Row>
          {settings.fetchFullGames && (
            <Row label={de ? 'Spiele pro Spieler mit Detaildaten' : 'Games per player with full data'}>
              <input
                type="number"
                min={5}
                max={30}
                value={settings.fullGamesPerPlayer}
                onChange={(e) =>
                  void update({ fullGamesPerPlayer: Math.max(5, Math.min(30, Number(e.target.value) || 10)) })
                }
              />
            </Row>
          )}
          <Row
            label={de ? 'Pro-Spieler-Liste' : 'Pro player list'}
            hint={
              de
                ? 'pros.json in den Poro-Daten: Riot-ID "Name#TAG" oder PUUID als Schlüssel, Anzeigename als Wert. Treffer bekommen in der Lobby den Tag "Pro".'
                : 'pros.json in the Poro data folder: Riot ID "Name#TAG" or PUUID as key, display name as value. Matches get the "Pro" tag in the lobby.'
            }
          >
            <span className="btn-group">
              <button type="button" className="btn btn-sm" onClick={() => void window.poro.openProList()}>
                <IconFolder size={14} />
                {de ? 'Liste öffnen' : 'Open list'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void window.poro.reloadProList().then(setProsCount)}
              >
                <IconRefresh size={14} />
                {de ? 'Neu laden' : 'Reload'}
                {prosCount !== undefined && <span className="muted"> ({prosCount})</span>}
              </button>
            </span>
          </Row>
          <Row
            label={de ? 'Sessions aufzeichnen' : 'Record sessions'}
            hint={
              de ? 'Rohdaten als JSON für Tests, siehe Diagnose.' : 'Raw JSON for tests, see diagnostics.'
            }
          >
            {toggle('recordSessions')}
          </Row>
        </Section>

        <Section
          title="Riot API"
          intro={
            de
              ? 'Der Key wird nur lokal gespeichert. Er ergänzt deine Match-History über Match-V5, liefert Post-Game-Timelines und speist den Statistik-Crawler. Development-Keys laufen nach 24 h ab.'
              : 'The key is stored locally only. It completes your match history via Match-V5, provides post-game timelines and feeds the statistics crawler. Development keys expire after 24 h.'
          }
        >
          <Row label="Riot API Key">
            <input
              type="password"
              className="wide"
              value={settings.riotApiKey}
              placeholder="RGAPI-…"
              onChange={(e) => void update({ riotApiKey: e.target.value.trim() })}
            />
          </Row>
          <Row
            label={de ? 'Statistik-Crawler' : 'Statistics crawler'}
            hint={
              de
                ? 'Sammelt Ranked-Spiele des Patches (Smaragd bis Challenger) für Tier-Liste, Counter, Bans und Meta-Builds. Läuft nur, solange Poro offen ist.'
                : 'Collects ranked games of the patch (Emerald to Challenger) for the tier list, counters, bans and meta builds. Runs only while Poro is open.'
            }
          >
            {toggle('crawlerEnabled')}
          </Row>
          <Row
            label={`${de ? 'Anfragen pro Minute' : 'Requests per minute'} · ${settings.crawlerRequestsPerMinute}`}
            hint={
              de
                ? 'Ein Personal Key erlaubt 100 Anfragen pro 2 Minuten; 40 pro Minute lassen Reserve für die Lobby-Analyse.'
                : 'A personal key allows 100 requests per 2 minutes; 40 per minute leave headroom for the lobby analysis.'
            }
          >
            <input
              type="range"
              min={10}
              max={45}
              step={5}
              value={settings.crawlerRequestsPerMinute}
              onChange={(e) => void update({ crawlerRequestsPerMinute: Number(e.target.value) })}
            />
          </Row>
        </Section>

        <Section
          title={de ? 'In-Game-Overlay' : 'In-game overlay'}
          intro={
            de
              ? `Das Overlay erscheint automatisch, sobald ein Spiel läuft. Es ist durchklickbar; ${hotkey(overlay.hotkeys.interactive)} entsperrt es zum Verschieben und für die Jungle-Timer, ${hotkey(overlay.hotkeys.toggle)} blendet es ein oder aus. Position: automatisch neben dem Spielfenster, wenn dort Platz ist (z. B. mit LoL 27), sonst am linken Rand im Spiel; einmal verschoben bleibt es an dieser Stelle. League muss im Modus "Randlos" oder "Fenster" laufen.`
              : `The overlay appears automatically while a game runs. It is click-through; ${hotkey(overlay.hotkeys.interactive)} unlocks it for moving and for the jungle timers, ${hotkey(overlay.hotkeys.toggle)} shows or hides it. Position: automatically beside the game window when there is room (e.g. with LoL 27), otherwise at the left edge inside the game; once dragged it stays there. League must run in "Borderless" or "Windowed" mode.`
          }
        >
          <Row label={de ? 'Overlay anzeigen' : 'Show overlay'}>{toggle('overlayEnabled')}</Row>
          <Row
            label={de ? 'Hotkey: entsperren / fixieren' : 'Hotkey: unlock / lock'}
            hint={
              de
                ? 'Klicken und Kombination drücken. Rücktaste setzt den Standard zurück.'
                : 'Click and press the combination. Backspace restores the default.'
            }
          >
            <HotkeyInput
              value={settings.hotkeyInteractive}
              fallback={DEFAULT_HOTKEYS.interactive}
              de={de}
              onChange={(acc) => void update({ hotkeyInteractive: acc })}
            />
          </Row>
          <Row
            label={de ? 'Hotkey: ein- / ausblenden' : 'Hotkey: show / hide'}
            hint={
              overlay.hotkeyError ? (
                <span className="error">
                  {de
                    ? 'Nicht registrierbar (belegt oder ungültig): '
                    : 'Could not register (taken or invalid): '}
                  {hotkey(overlay.hotkeyError)}
                </span>
              ) : undefined
            }
          >
            <HotkeyInput
              value={settings.hotkeyToggle}
              fallback={DEFAULT_HOTKEYS.toggle}
              de={de}
              onChange={(acc) => void update({ hotkeyToggle: acc })}
            />
          </Row>
          <Row label={de ? 'Spieler-Stats im Overlay' : 'Player stats in the overlay'}>
            {toggle('overlayShowPlayers')}
          </Row>
          <Row label={de ? 'Jungle-Timer im Overlay' : 'Jungle timers in the overlay'}>
            {toggle('overlayShowJungle')}
          </Row>
          <Row
            label={
              de ? 'Ton 60 s und 30 s vor Objective-Spawns' : 'Sound 60 s and 30 s before objective spawns'
            }
          >
            {toggle('overlaySound')}
          </Row>
          <Row label={`${de ? 'Deckkraft' : 'Opacity'} · ${Math.round(settings.overlayOpacity * 100)} %`}>
            <input
              type="range"
              min={30}
              max={100}
              value={Math.round(settings.overlayOpacity * 100)}
              onChange={(e) => void update({ overlayOpacity: Number(e.target.value) / 100 })}
            />
          </Row>
          <Row label={`${de ? 'Größe' : 'Scale'} · ${Math.round(settings.overlayScale * 100)} %`}>
            <input
              type="range"
              min={70}
              max={140}
              step={5}
              value={Math.round(settings.overlayScale * 100)}
              onChange={(e) => void update({ overlayScale: Number(e.target.value) / 100 })}
            />
          </Row>
          <Row label={de ? 'Overlay-Position' : 'Overlay position'}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void update({ overlayBounds: undefined })}
            >
              {de ? 'Zurücksetzen' : 'Reset'}
            </button>
          </Row>
        </Section>

        <Section
          title={de ? 'Updates' : 'Updates'}
          intro={
            de
              ? 'Poro lädt Updates von einem eigenen Ordner im Web (HTTPS): dort liegen latest.yml, der Installer und die .blockmap aus dem Release-Build. Ohne Adresse findet keine Prüfung statt. Ein heruntergeladenes Update wird beim nächsten Beenden installiert.'
              : 'Poro loads updates from a folder on the web (HTTPS) holding latest.yml, the installer and the .blockmap of the release build. Without an address nothing is checked. A downloaded update installs on the next quit.'
          }
        >
          <Row label={de ? 'Update-Adresse' : 'Update address'}>
            <input
              type="url"
              className="wide"
              value={settings.updateUrl}
              placeholder="https://…/poro/"
              onChange={(e) => void update({ updateUrl: e.target.value.trim() })}
            />
          </Row>
          <Row label={de ? 'Beim Start prüfen' : 'Check on start'}>{toggle('updateCheckOnStart')}</Row>
          <Row
            label={de ? 'Status' : 'Status'}
            hint={
              <span className={updateStatus.state === 'error' ? 'error' : undefined}>
                {updateLabel(updateStatus, de)}
              </span>
            }
          >
            <span className="btn-group">
              <button
                type="button"
                className="btn btn-sm"
                disabled={busyUpdate || !settings.updateUrl.trim()}
                onClick={() => void window.poro.checkUpdate()}
              >
                <IconRefresh size={14} />
                {de ? 'Jetzt prüfen' : 'Check now'}
              </button>
              {updateStatus.state === 'downloaded' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void window.poro.installUpdate()}
                >
                  <IconDownload size={14} />
                  {de ? 'Neu starten und installieren' : 'Restart and install'}
                </button>
              )}
            </span>
          </Row>
        </Section>

        <Section
          title={de ? 'Sicherung' : 'Backup'}
          intro={
            de
              ? 'Export schreibt alle Einstellungen außer dem Riot-API-Key und der Overlay-Position als JSON. Import übernimmt bekannte Werte aus so einer Datei.'
              : 'Export writes all settings except the Riot API key and the overlay position as JSON. Import takes known values from such a file.'
          }
        >
          <Row label={de ? 'Einstellungen' : 'Settings'} hint={ioMessage}>
            <span className="btn-group">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void window.poro
                    .exportSettings()
                    .then((path) =>
                      setIoMessage(path ? `${de ? 'Gespeichert: ' : 'Saved: '}${path}` : undefined),
                    )
                }
              >
                {de ? 'Exportieren' : 'Export'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void window.poro.importSettings().then((r) => setIoMessage(r.message || undefined))
                }
              >
                {de ? 'Importieren' : 'Import'}
              </button>
            </span>
          </Row>
        </Section>

        <p className="muted small disclaimer">
          Poro isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
          officially involved in producing or managing Riot Games properties. Riot Games and League of Legends
          are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </>
  );
}
