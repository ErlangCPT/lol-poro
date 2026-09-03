# Implementation Plan – Porofessor-Klon ("Poro")

Stand 01.09.2026. Baut auf `docs/01-porofessor-analyse.md` auf.

**Umsetzungsstand (02.09.2026):** Phase 0 bis 5 sind implementiert; Phase 0, 1, 2, 4 und 5 wurden gegen den echten
Client bzw. die echte Riot API geprüft, Phase 3 (Overlay, Objective-Timer, Live-Stats, Jungle-Timer) bisher nur mit dem synthetischen Spiel
(`--demo-live`), die Abnahme in einem echten Spiel oder im Übungswerkzeug steht aus (siehe README, Abschnitt Status).
Am 03.09.2026 wurde die Oberfläche neu gestaltet (Sidebar, Team-Karten mit Spielerzeilen, Champion-Leiste, siehe README,
Abschnitt Oberfläche). Phase 6 (Politur) ist am 03.09.2026 umgesetzt: Auto-Update (generic provider), lokale
Absturzberichte, Settings-Export/-Import, konfigurierbare Hotkeys, helles/dunkles Design, Pro-Spieler-Liste,
CPU-Anzeige in der Diagnose, Signierung vorbereitet; Discord Rich Presence weggelassen.
Abweichungen: JSON-Datei-Cache für Spielerdaten bleibt, SQLite (`node:sqlite`, kein natives Modul) nur für die
Post-Game-Historie; `packages/riot-api` wurde vorgezogen, weil der Client die
eigene Match-History nur unvollständig liefert; Ban-/Counter-Vorschläge kommen aus dem lokalen Crawler in der Desktop-App statt aus einem Server-Crawler (kein
`apps/web`, keine Vercel-Cron); Jungle-Camp-Hotkeys
wurden bewusst weggelassen (Konflikt mit Spiel-Tasten), Camps werden im Overlay per Klick markiert (das Overlay
nimmt die Maus an, sobald der Cursor auf Kopfzeile oder Button steht — kein Entsperr-Hotkey).

## 0. Ziel und Leitentscheidungen

**Ziel:** Eine eigene Companion-App für League of Legends, die die Kernfunktionen von Porofessor stabil
nachbildet, ohne Overwolf-Abhängigkeit, ohne Werbung und ohne die Fehlerklassen, an denen Porofessor krankt
(Overlay hängt sich nicht an, Champ Select nicht erkannt, korrupte Caches).

**Leitentscheidungen (mit Begründung):**

| Entscheidung                           | Wahl                                                                                    | Warum                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plattform                              | Desktop-App mit **Electron + TypeScript + React (Vite via electron-vite)**              | Porofessor Standalone, Blitz und LeagueAkari laufen auf Electron; reifste LCU-Bibliotheken (league-connect, hexgate); transparente Overlay-Fenster out of the box. Tauri wäre leichter, hat aber deutlich weniger LCU/Overlay-Ökosystem. |
| Primäre Datenquelle für fremde Spieler | **LCU-Endpunkte** (`lol-match-history`, `lol-ranked`, `lol-champion-mastery`)           | Kein Riot-API-Key nötig, keine Rate-Limit-Probleme im Champ Select, funktioniert exakt so in LeagueAkari. Riot-API nur als Ergänzung.                                                                                                    |
| Riot Games API                         | **Personal Key** für Website-Suche, Timeline-Daten und den optionalen Statistik-Crawler | Development-Key läuft alle 24 h ab. Production-Key erst beantragen, wenn ein Prototyp steht.                                                                                                                                             |
| Overlay-Technik                        | Transparentes Always-on-top-BrowserWindow, Spiel im Borderless-Modus                    | Vanguard-sicher (kein Injection). Exklusives Vollbild wird bewusst nicht unterstützt.                                                                                                                                                    |
| Jungle-Camp-Timer                      | Phase 3 mit manuellen Klick-Timern, optional später `@overwolf/ow-electron` GEP         | Live Client API liefert keine Camp-Events.                                                                                                                                                                                               |
| Persistenz                             | SQLite (better-sqlite3) lokal, Cache pro Patch versioniert                              | Behebt die Cache-Korruptions-Probleme; Match-Daten müssen nicht dauernd neu geladen werden.                                                                                                                                              |
| Sprache                                | UI in Deutsch und Englisch (i18n von Anfang an)                                         | Zielnutzer deutschsprachig, Datenquellen englisch.                                                                                                                                                                                       |

Policy-Grenzen, die bewusst **nicht** implementiert werden: Ultimate-Timer, gegnerische Summoner-Spell-Timer,
Power-Spike-Hinweise, Handlungsanweisungen, Namensanzeige fremder Allies im Ranked-Solo-Champ-Select.

## 1. Architektur

```
poro-klon-final/
├─ apps/
│  ├─ desktop/                 Electron-App (main, preload, renderer)
│  │  ├─ src/main/             Prozess-Orchestrierung, Fenster, IPC, Services
│  │  ├─ src/preload/          typed IPC bridge (contextIsolation)
│  │  └─ src/renderer/         React-UI: Lobby-Analyse, Champ-Select-Panel, Overlay, Post-Game, Settings
│  └─ web/ (optional, Phase 5)  Next.js: Live-Game-Suche per Riot ID, geteilte Stats
├─ packages/
│  ├─ lcu/                     LCU-Client: Lockfile/Prozess-Discovery, REST + WebSocket, Reconnect, Typen
│  ├─ live-client/             Live Client Data API Client (Polling, Event-Diff, Typen)
│  ├─ riot-api/                Riot-API-Client mit Rate-Limiter (Header-gesteuert), Routing, Retry-After
│  ├─ static-data/             Data Dragon/CommunityDragon Sync, Champion-/Item-/Rune-/Spell-Tabellen, Team-Trait-Tabelle
│  ├─ core/                    Domänenlogik ohne Electron: Stats-Aggregation, Tag-Engine, Premade-Erkennung,
│  │                           Rollen-Erkennung, Objective-Timer-Modell, Post-Game-Metriken
│  └─ storage/                 SQLite-Schema, Migrationen, Caches, Settings
└─ docs/
```

Werkzeuge: pnpm Workspaces, TypeScript strict, ESLint + Prettier, Vitest (Unit/Integration), Playwright
(Renderer-E2E), electron-builder (NSIS-Installer, Auto-Update), GitHub Actions.

**Datenfluss (Kern):**

```
LCU WebSocket ──gameflow-phase──▶ GameflowService ──▶ Zustand-Maschine
                                                     │  Lobby → ChampSelect → InProgress → EndOfGame
LCU champ-select/session ────────▶ ChampSelectService ─▶ Sichtbare Spieler (PUUIDs) + Bans + Picks
LCU gameflow/session (InProgress) ▶ LoadingScreenService ▶ alle 10 Spieler (PUUID, Riot ID, Champion, Rolle)
                                                     ▼
PlayerDataService: pro PUUID  summoner → ranked-stats → match-history (30 Tage, paginiert) → mastery
                    (Cache in SQLite, parallel mit Concurrency-Limit, Fehler pro Spieler isoliert)
                                                     ▼
core: StatsAggregator → TagEngine → PremadeDetector → TeamStats/TeamTags
                                                     ▼
Renderer (Lobby-Analyse-Fenster)   und   Overlay (kompakte Live-Stats)
Live Client API (2999) ──Polling 1 s──▶ InGameService ▶ Objective-/Inhib-Timer, Scores, Items ▶ Overlay
EndOfGame ─────────────────────────▶ PostGameService ▶ EOG-Block + Match-V5/Timeline ▶ Charts + History-DB
```

## 2. Phasen

### Phase 0 – Fundament (ca. 1 Woche)

1. Monorepo anlegen (pnpm, electron-vite, React, TypeScript strict, ESLint, Vitest, electron-builder).
2. `packages/lcu`: Discovery über Lockfile **und** Prozessargumente (`Get-CimInstance Win32_Process`), REST-Client
   mit Riot-Root-Zertifikat, WebSocket-Subscription, exponentieller Reconnect, Client-Start/-Stop-Erkennung.
   Abnahme: App zeigt live die Gameflow-Phase an und überlebt Client-Neustart.
3. `packages/static-data`: Data-Dragon-Versionsabfrage, Download von Champions/Items/Runen/Spells (de_DE, en_US),
   Bild-Cache auf Platte, Patch-versionierter Cache-Ordner, automatische Invalidierung.
4. `packages/storage`: SQLite-Schema (players, ranked_stats, matches, match_participants, tags_cache, settings),
   Migrationen, TTLs (Summoner 24 h, Ranked 30 min, Matchliste 15 min, Matchdetails unbegrenzt pro gameId).
5. Riot-Personal-Key im Developer Portal registrieren (riot.txt), Key nur in lokaler Config (nie im Repo).
6. Riot-Disclaimer in der App, Grund-Settings-Seite, Logging (electron-log) mit Rotations-Dateien.

### Phase 1 – Lobby-Analyse (Kernfeature, ca. 2–3 Wochen)

1. **Zustandsmaschine** über Gameflow-Phasen mit Debounce; jede Phase hat einen definierten UI-Zustand
   (auch "Client nicht gefunden", "Spiel läuft, aber Daten fehlen").
2. **Sichtbarkeitsmatrix** implementieren:
   - Ranked Solo/Duo Champ Select: nur eigene Party (nameVisibilityType ≠ HIDDEN, PUUID vorhanden) → Stats;
     andere Allies als "Ally #n" ohne Daten.
   - Normal Draft / Flex / andere Queues: alle Allies mit PUUID → Stats im Champ Select.
   - Ab Ladebildschirm (InProgress): alle 10 Spieler aus `gameflow/session.gameData`.
3. **PlayerDataService**: pro Spieler Summoner → Ranked → Match-History (Seiten à 20 bis 30 Tage abgedeckt oder
   max. 100 Spiele) → Mastery. Concurrency 3–4, Timeouts, Teilresultate anzeigen statt alles-oder-nichts.
   Streamer-Mode/unbekannt → Karte mit Hinweis wie bei Porofessor.
4. **StatsAggregator** (nur Normal + Ranked 5v5, 30 Tage, Filter umschaltbar): Winrate, Spiele, KDA, CS/min,
   Gold/min, Damage/min, Wards/min, Kill Participation, Turret Takedowns, pro Champion und gesamt;
   Aktivität 12 h und 30 Tage; Vorsaison-Rang; Main-Rollen aus Rollenverteilung.
5. **Rollen-Erkennung** für das aktuelle Spiel: assignedPosition aus dem Champ Select, sonst Zuordnung über
   Smite/Support-Items/Champion-Rollenwahrscheinlichkeiten (ungarischer Algorithmus über 5 Spieler).
6. **TagEngine** (Regeln in `core`, testbar mit Fixtures), Startwerte:
   - Hot Streak ≥ 3 Siege in Folge, Cold Streak ≥ 3 Niederlagen in Folge (letzte Spiele)
   - Godlike <Champ>: ≥ 10 Spiele, Winrate ≥ 60 %, KDA ≥ 4
   - OTP <Champ>: Champion-Anteil ≥ 50 % bei ≥ 15 Spielen; <Champ> lover: Anteil ≥ 30 %
   - Millionaire: Mastery-Punkte ≥ 1.000.000
   - First time <Champ>: 0 Spiele in 30 Tagen und Mastery-Level ≤ 1
   - Main banned / Main Picked by enemy: meistgespielter Champion in Bans bzw. bei Gegnern
   - <Gegner> stomper: ≥ 3 Spiele gegen Lane-Gegner-Champion mit Winrate ≥ 66 %
   - Good/Bad CSer, High Damage, Good/Bad vision, High Kill Participation, Turret destroyer:
     Vergleich mit Rollen-Benchmarks (z. B. CS/min Top/Mid/ADC ≥ 7,5 gut, ≤ 5,5 schlecht)
   - Aggressive/Vulnerable Laner, Aggressive Jungler, Invader, Split Pusher: aus Kills/Deaths-Profil bzw.
     Match-V5 `challenges` (soloKills, killsNearEnemyTurret, enemyJungleMonsterKills, turretPlatesTaken)
   - Off-role/Autofilled: aktuelle Rolle ≠ Top-2-Main-Rollen; Smurf-Verdacht: Level < 60, Winrate ≥ 65 %, ≥ 15 Spiele
   - Pro: Abgleich mit Pro-Liste (optional, Phase 6)
     Jeder Tag: id, Label (i18n), Kategorie, Ton (good/neutral/bad), Erklärungstext mit den Zahlen.
7. **PremadeDetector**: gemeinsame gameIds im selben Team in den letzten 30 Tagen (≥ 2 gemeinsame Spiele),
   Gruppen farblich markieren.
8. **Team Stats + Team Tags**: Mittelwerte wie Porofessor; Team-Tags aus einer manuell gepflegten
   Champion-Trait-Tabelle (frontline, engage, dive, backline access, waveclear, siege, splitpush, depush, melee).
9. UI: Fenster "Lobby-Analyse" mit 2×5 Karten im Porofessor-Layout (siehe Screenshot), Bans, Queue,
   Filter, Sortierung, Klick auf Tag zeigt die Begründung.

### Phase 2 – Champ-Select-Werkzeuge (ca. 1–2 Wochen)

1. **Runen-Import**: Quelle 1 Riots eigene Empfehlungen (`recommended-pages/champion/{id}/position/{pos}/map/11`),
   Quelle 2 eigene gespeicherte Pages; Schreiben über delete-then-post auf `lol-perks/v1/pages`,
   Page-Limit beachten, Name mit Präfix "Poro:".
2. **Item-Set-Import** über `lol-item-sets`, **Summoner-Spell-Vorschlag** setzen (`champ-select/v1/session/my-selection`).
3. **Auto-Accept** (opt-in) über `lol-matchmaking/v1/ready-check/accept`.
4. **Ban-/Pick-Vorschläge und Counter-Tipps**: zunächst aus eigenen aggregierten Daten (Phase 5) oder aus der
   persönlichen Historie ("gegen Champ X 30 % Winrate"); Datenquellen von Drittanbietern (u.gg, lolalytics)
   nur, wenn deren Nutzungsbedingungen es erlauben.
5. Champion-Detail-Panel: Schadensart des Gegnerteams (AD/AP/True-Anteil aus statischen Daten), Matchup-Hinweise.

### Phase 3 – In-Game-Overlay (ca. 2 Wochen)

1. Overlay-Fenster: transparent, frameless, always-on-top, click-through mit Hotkey zum Umschalten,
   Positionen/Größen/Transparenz persistent, an das LoL-Fenster geheftet (Fensterrechteck via `user32`).
   Erkennung "Spiel im exklusiven Vollbild" → Hinweis anzeigen.
2. `packages/live-client`: Polling 1 s, Zertifikat akzeptieren, Event-Diff, Reconnect wenn Port 2999 fehlt.
3. **Objective-Timer**: Drache (Typ, Soul-Zähler, Elder), Baron, Herald, Voidgrubs, Atakhan, Inhibitoren.
   Spawn-/Respawn-Zeiten in `objectives.json` pro Patch konfigurierbar; Event-Namen für Grubs/Atakhan
   in-game über die OpenAPI-Spec prüfen. Akustischer Hinweis 60/30 s vorher (opt-in).
4. **Live-Stats-Widget**: pro Spieler Rank/Winrate (aus Phase 1), CS @10/@20, Wards @10/@20, KP, Respawn-Timer;
   Team-Gold-Schätzung aus Item-Werten + Level (klar als Schätzung markiert).
5. **Jungle-Camp-Timer (eigenes Team)**: Klick-Buttons pro Camp (Respawn-Zeiten konfigurierbar), Hotkeys.
   Später optional `@overwolf/ow-electron` GEP `jungle_camps` als automatische Quelle.
6. Bewusst ausgelassen: alles aus der Policy-Liste in `01-porofessor-analyse.md` Abschnitt 5.

### Phase 4 – Post-Game (ca. 1–2 Wochen)

1. EndOfGame: `eog-stats-block` einlesen, Spiel in die lokale History schreiben.
2. Match-V5 + Timeline (Personal Key) nachladen: Gold/CS/XP-Kurven vs. Lane-Gegner, Schadensverteilung,
   Vision-Verlauf, Objective-Beteiligung, Gold @10/@20.
3. Post-Game-Fenster mit Charts (Recharts), Vergleich zum eigenen 30-Tage-Schnitt, Trend über die letzten 20 Spiele.

### Phase 5 – Statistik-Pipeline (optional, parallel ab Phase 2)

1. Crawler-Service (Node, eigener Prozess oder `apps/web` auf Vercel Cron) mit Personal Key:
   Seed über League-V4-Ladder (Emerald+), Match-IDs per PUUID, Matches speichern; 100 Requests/2 min ergeben
   ca. 60.000 Matches/Tag, genug für Winrate/Pickrate/Banrate/Builds/Runen pro Patch und Rolle.
2. Aggregate: Champion-Tier-Liste, Counter-Matrix, populäre Builds/Runen, Rollen-Benchmarks für die Tag-Engine.
3. Bereitstellung als statische JSON-Snapshots (pro Patch) für die Desktop-App.
4. Sobald Nutzerzahl > 1: Production-Key beantragen (Prototyp aus Phase 1–3 als Nachweis).

### Phase 6 – Politur und Verteilung

Auto-Update, Crash-Reporting lokal, Settings-Export, Hotkeys, Dark/Light, Pro-Spieler-Liste,
Performance-Budget (Overlay < 2 % CPU), Installer-Signierung, Discord-Rich-Presence (optional).

### Später – Discord Rich Presence (verschoben am 03.09.2026)

Statusanzeige im Discord-Profil ("Spielt League of Legends · Champion Select · Ranked Solo/Duo" bzw. "Im Spiel ·
Viego · 14:32"). Voraussetzung: eigene Anwendung im Discord Developer Portal (App-ID, hochgeladene Bilder).
Umsetzung, wenn gewünscht: Einstellung "Discord-Status anzeigen" plus App-ID-Feld, Client über die lokale
Discord-IPC-Pipe (z. B. `discord-rpc` oder `@xhayper/discord-rpc`), Aktualisierung alle 15 s aus Gameflow-Phase,
Champion Select und Live-Daten, keine Fehler, wenn Discord nicht läuft. Rein kosmetisch, keine Abhängigkeit
anderer Funktionen.

## 3. Datenmodell (Auszug, `packages/core`)

```ts
type Player = { puuid: string; riotId: string; platform: Platform; level: number; profileIconId: number };
type RankedEntry = {
  queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
  tier: string;
  division: string;
  lp: number;
  wins: number;
  losses: number;
  previousSeasonTier?: string;
};
type MatchSummary = {
  gameId: number;
  queueId: number;
  gameCreation: number;
  durationSec: number;
  win: boolean;
  championId: number;
  role: Role;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  wardsPlaced: number;
  visionScore: number;
  turretTakedowns: number;
  teamKills: number;
  teammates: string[] /* PUUIDs */;
  opponents: { puuid: string; championId: number; role: Role }[];
};
type PlayerStats = {
  games: number;
  wins: number;
  kda: [number, number, number];
  csPerMin: number;
  goldPerMin: number;
  dmgPerMin: number;
  wardsPerMin: number;
  killParticipation: number;
  perChampion: Record<number, ChampionStats>;
  mainRoles: Role[];
  last12h: { games: number; wins: number };
  streak: { type: 'win' | 'loss'; length: number };
};
type Tag = {
  id: string;
  label: string;
  tone: 'good' | 'neutral' | 'bad';
  category: 'farming' | 'fighting' | 'objectives' | 'vision' | 'champion' | 'form' | 'meta';
  reason: string;
};
type LobbyPlayer = {
  player?: Player;
  cellId: number;
  team: 'ally' | 'enemy';
  championId: number;
  role: Role;
  spells: [number, number];
  visibility: 'visible' | 'party' | 'hidden';
  stats?: PlayerStats;
  ranked?: RankedEntry[];
  mastery?: number;
  tags: Tag[];
  premadeGroup?: number;
};
```

## 4. Teststrategie

- Tag-Engine und Aggregation: reine Funktionen mit JSON-Fixtures (aufgezeichnete LCU-Antworten), Vitest.
- LCU/Live-Client: Recorder-Modus in der App (speichert alle Antworten/Events einer Session anonymisiert),
  Replay im Test ohne laufenden Client; Mock-HTTPS-Server auf 2999 für Overlay-Tests.
- Zustandsmaschine: Property-Tests für Phasenübergänge inkl. Client-Absturz und Reconnect.
- E2E: Playwright gegen den Renderer mit gemocktem IPC.
- Manuelle Abnahme pro Phase in einem Custom Game und in einem Normal-Draft.

## 5. Risiken und Gegenmaßnahmen

| Risiko                                                      | Auswirkung              | Maßnahme                                                                                          |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| LCU-Endpunkte ändern sich mit Patches (undokumentiert)      | Features brechen        | Typen aus aktuellem Swagger generieren, Smoke-Test nach jedem Patch, Fehler pro Feature isolieren |
| LCU-Match-History liefert weniger Detailfelder als Match-V5 | manche Tags ungenau     | Kernstats aus LCU, Feintags nur, wenn Match-V5-Daten vorhanden; Tag sonst weglassen               |
| Riot-Policy verschärft sich weiter                          | Feature entfernen       | Policy-Checkliste je Release, In-Game-Features hinter Feature-Flags                               |
| Exklusives Vollbild                                         | Overlay unsichtbar      | Klare Anleitung, Erkennung + Hinweis; ow-electron als späterer Ausweg                             |
| Rate-Limits Personal Key                                    | Website/Crawler langsam | Header-gesteuerter Limiter, Caching, Priorisierung; Production-Key beantragen                     |
| Antivirus/Firewall blockiert lokale HTTPS-Verbindungen      | "Client nicht gefunden" | Diagnose-Seite in der App (Port, Lockfile, Zertifikat, Prozess)                                   |

## 6. Erste konkrete Schritte

1. Phase 0 Schritt 1–2 umsetzen: Monorepo + LCU-Verbindung, Anzeige der Gameflow-Phase.
2. Recorder bauen und eine komplette Session (Lobby → Spiel → EndOfGame) als Fixture aufnehmen.
3. Damit Phase 1 (Aggregation + Tag-Engine) testgetrieben entwickeln, bevor die UI entsteht.

## 7. Offene Entscheidungen

- Electron (empfohlen) oder Tauri: nur relevant, wenn Bundle-Größe/RAM Priorität haben.
- Statistik-Pipeline (Phase 5) selbst betreiben oder Ban-/Counter-Vorschläge zunächst weglassen.
- ow-electron für automatische Jungle-Timer: bringt Overwolf-Registrierung zurück, deshalb erst nach Phase 3 bewerten.
