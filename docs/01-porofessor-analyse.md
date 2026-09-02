# Porofessor.gg – Feature-Analyse (Stand 01.09.2026)

Grundlage für den Klon. Quellen: porofessor.gg (Download-, FAQ-, Live-Game-Seite, per Browser aufgenommen),
Overwolf-App-Seite (Version 2.16.15 vom 28.08.2026), Overwolf-Compliance-Doku für Riot Games,
Riot Developer Portal, LCU-Swagger (hasagi-types), Overwolf GEP-Doku.

Screenshot einer echten Live-Game-Seite: `docs/research/porofessor-live-fullpage.jpeg`.

---

## 1. Was Porofessor ist

- Companion-App für League of Legends, vom Macher von leagueofgraphs.com (M.O.B.A. Network).
- Zwei Distributionen: Overwolf-App (2,6 MB Shell) und **Standalone-Version auf Electron-Basis (~100 MB)**,
  die ohne Overwolf-Client läuft. Beide werden aktiv gepflegt.
- Datenquelle laut FAQ: ausschließlich Riot-APIs. Statistiken basieren auf **Normal- und Ranked-5v5-Spielen
  der letzten 30 Tage**.
- Rollen-Erkennung: aus globaler Champion-Nutzung plus individueller Historie wird die wahrscheinlichste
  Rollenverteilung geschätzt.
- Finanzierung: Werbung im Free-Tier, Premium-Abo (werbefrei, Extras). In-Game-Werbung ist seit 29.05.2025
  von Riot verboten.

## 2. Feature-Inventar

### 2.1 Champion Select ("Prepare for battle")

| Feature                            | Details                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Ban-Vorschläge                     | basierend auf Meta-Statistiken                                                         |
| Counterpick-Tipps / Matchup Review | Champion-vs-Champion-Daten, Schadensarten des Gegnerteams                              |
| Meta-Übersicht                     | Tier-Liste, Winrate/Pickrate des eigenen Champions, Counter                            |
| Runen-Import                       | empfohlene Runen mit einem Klick in den Client                                         |
| Build-/Spell-Import                | Items (Item-Sets) und Summoner Spells in den Client pushen                             |
| Spieler-Scouting                   | Rank, Winrate, KDA, Main-Rollen, Champion-Erfahrung, Player Tags für sichtbare Spieler |
| Premade-Erkennung                  | Gruppierung von Spielern, die zusammen gespielt haben                                  |

Einschränkung durch Riot: In **Ranked Solo/Duo** sind fremde Mitspieler im Champ Select anonym
("Ally #1" …). Die volle 10-Spieler-Analyse ist erst ab dem Ladebildschirm erlaubt.

### 2.2 Live-Game-Ansicht (Ladebildschirm / Website)

Pro Spieler eine Karte (siehe Screenshot):

- Riot ID (Link zum Profil), Champion-Icon mit Mastery-Punkten (z. B. "199" = 199k), Mastery-Level
- Summoner Spells
- Champion-Stats 30 Tage: `47% Win (19 Played)`, KDA `5.9 / 5.6 / 5.6` (farbig), globaler Champion-Rang `#482`
- Ranked: Tier-Icon, `GrandMaster 2173 LP (Soloqueue)`, Vorsaison-Rang (`S26.S1: Challenger`),
  Saison-Winrate `56% Win (713 Played)`, globaler Rang `#3,588`
- Rolle: `Top (Current game)` + `Main Roles: Top`
- Aktivität: letzte 12 h (`3 Played / 2 Wins`) und letzte 30 Tage (`127 Played / 66 Wins`)
- **Player Tags** (farbcodiert grün/gelb/rot), siehe 2.3
- Fallback: "This player is using streamer mode or is unknown; player data is hidden"

Kopfbereich: Queue-Typ + Spielzeit, Spectate-Button, Recording, Bans beider Teams,
Filter "Normal & Ranked stats" / "Last 30 days", Link "Top Builds for <Champion>".

Fußbereich **Team Stats** pro Team: Average Winrate, Average KDA (mit Ratio), Average Gold/min,
Average Damage/min (Balken), Average Wards placed/min, plus **Team Tags**.

### 2.3 Player Tags (auf der Live-Seite tatsächlich beobachtet)

| Tag                                       | Kategorie (Link-Ziel auf LoG) | Farbe      |
| ----------------------------------------- | ----------------------------- | ---------- |
| Good CSer                                 | farmingData                   | grün       |
| Aggressive Laner / Aggressive Jungler     | fightingData                  | grün       |
| Vulnerable Laner                          | fightingData                  | rot        |
| High Damage                               | fightingData                  | grün       |
| High Kill Participation                   | fightingData                  | grün       |
| Turret destroyer                          | objectivesData                | grün       |
| Split Pusher                              | –                             | gelb       |
| Invader                                   | –                             | gelb       |
| Good vision / Bad vision                  | visionData                    | grün / rot |
| Godlike <Champion>                        | Champion-Seite                | grün       |
| OTP <Champion>                            | Champion-Seite                | grün       |
| <Champion> lover                          | Champion-Seite                | gelb       |
| Millionaire: <Champion> (>1 Mio. Mastery) | Champion-Seite                | grün       |
| <Gegnerchampion> stomper                  | –                             | grün       |
| Hot Streak / Cold Streak                  | championsData                 | grün / rot |
| Good mood                                 | –                             | grün       |
| Main banned                               | championsData                 | rot        |
| Main Picked by enemy                      | championsData                 | rot        |
| Pro: <Name>                               | –                             | blau       |

Weitere, aus der App bekannte Tags (nicht auf dieser Seite gesehen, als Kandidaten führen):
First time <Champion>, Autofilled / Off-role, Smurf-Verdacht, Comeback, Feeder/Dies a lot.

### 2.4 Team Tags (beobachtet)

Good/Weak frontline, Splitpush potential, Great dive, Great backline access, Good engage,
Good waveclear, Good/Bad depush, Good siege, Good gank setup, Not enough Melee.
Diese werden aus Champion-Eigenschaften der Team-Komposition abgeleitet, nicht aus Spielerdaten.

### 2.5 In-Game-Overlay

| Feature                                                   | Datenquelle bei Porofessor        | Policy-Status 2026                                                                                                                              |
| --------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective-Timer (Drache, Baron, Herald, Grubs, Atakhan)   | Live Client Events                | erlaubt                                                                                                                                         |
| Inhibitor-Timer                                           | Live Client Events                | erlaubt                                                                                                                                         |
| Jungle-Camp-Timer                                         | Overwolf GEP `jungle_camps`       | erlaubt (eigenes Team); Ableitung gegnerischer Camps aus API-Daten kritisch                                                                     |
| Live-Stats-Vergleich (Elo, Winrate der 10 Spieler)        | Champ-Select-Daten                | erlaubt                                                                                                                                         |
| CS @10/@20, Wards @10/@20, Kill Participation, DPM        | Live Client `playerlist`/`scores` | erlaubt                                                                                                                                         |
| Team-Gold-Differenz                                       | GEP / Schätzung                   | erlaubt                                                                                                                                         |
| Lane-Matchup-Winrate                                      | Statistik-Backend                 | erlaubt                                                                                                                                         |
| Ultimate-Timer (manuell per Klick)                        | –                                 | **verboten seit 13.03.2025**                                                                                                                    |
| Gegnerische Summoner-Spell-Timer                          | –                                 | **laut Overwolf-Compliance-Seite verboten** ("tracking of enemy summoner spells cooldowns, or facilitating players tracking these with timers") |
| Power-Spike-Hinweise ("X ist Level 6")                    | –                                 | **verboten**                                                                                                                                    |
| Handlungsanweisungen ("go gank top")                      | –                                 | **verboten**                                                                                                                                    |
| Overlay-Anpassung (Position, Größe, Transparenz, Hotkeys) | –                                 | erlaubt                                                                                                                                         |

### 2.6 Post-Game ("Very detailed match analysis")

- Charts zu Farming, Fighting, Vision, Objectives, Schaden pro Minute, Gold @10/@20
- Performance-Bewertung, Team-Performance, Verlauf/Trends über die Match-History
- Automatische Aufzeichnung der Match-Statistiken

### 2.7 Sonstiges (nicht Kern des Klons)

Pro Replays (benötigt Vanguard-Exit), "Find new Friends"/Duo-Finder, Simplified Patch Notes,
TFT-Support (Comps, Overlays, Tier-Listen), Website mit Live-Game-Suche pro Region.

## 3. Bekannte Probleme von Porofessor (Motivation für den Klon)

- Overwolf-Abhängigkeit: Hintergrundlast, Overlay hängt sich nicht an das Spiel, wenn RivaTuner/MSI Afterburner o. ä. laufen.
- Champ Select wird nicht erkannt bzw. Overlay erscheint nicht; empfohlene Fixes sind Cache leeren,
  Antivirus/VPN/Firewall/DNS deaktivieren, Overwolf-Troubleshooter.
- Korrupte Caches nach Updates (fehlende Champion-Icons).
- Streamer-Mode/unbekannte Spieler ohne Daten.
- Statische Builds statt matchbezogener Empfehlungen, keine KI-Features, Werbung.

Konsequenzen für den Klon: kein Overwolf-Zwang, robuste LCU-Verbindungslogik mit Reconnect,
Cache mit Versionierung pro Patch, klare Fehlerzustände in der UI.

## 4. Technische Grundlagen (verifiziert)

### 4.1 LCU API (League Client, lokal)

- Verbindung: `lockfile` unter `C:\Riot Games\League of Legends\lockfile`
  (Format `name:pid:port:password:protocol`) oder Prozess-Argumente `--app-port`/`--remoting-auth-token`.
  Basic-Auth `riot:<password>`, selbstsigniertes Zertifikat. WebSocket `wss://127.0.0.1:<port>`.
- Relevante Endpunkte (aus dem aktuellen LCU-Swagger geprüft):
  - `/lol-gameflow/v1/gameflow-phase` und `/lol-gameflow/v1/session` (Phasen: Lobby, Matchmaking,
    ReadyCheck, ChampSelect, InProgress, WaitingForStats, PreEndOfGame, EndOfGame). `session.gameData.teamOne/teamTwo`
    enthält ab dem Ladebildschirm alle 10 Spieler mit PUUID und Riot ID.
  - `/lol-champ-select/v1/session` (myTeam, theirTeam, bans, actions, timer, localPlayerCellId; pro Spieler
    puuid, summonerId, championId, championPickIntent, assignedPosition, spell1Id/spell2Id, nameVisibilityType).
  - `/lol-summoner/v2/summoners/puuid/{puuid}`
  - `/lol-ranked/v1/ranked-stats/{puuid}` (Ranked-Stats fremder Spieler)
  - `/lol-match-history/v1/products/lol/{puuid}/matches` (Match-History fremder Spieler, paginiert),
    `/lol-match-history/v1/games/{gameId}`, `/lol-match-history/v1/game-timelines/{gameId}`
  - `/lol-champion-mastery/v1/{puuid}/champion-mastery`
  - `/lol-perks/v1/pages`, `/lol-perks/v1/currentpage` (Runen schreiben),
    `/lol-perks/v1/recommended-pages/champion/{championId}/position/{position}/map/{mapId}` (Riots eigene Runen-Empfehlungen)
  - `/lol-item-sets/v1/item-sets/{summonerId}/sets` (Item-Sets schreiben)
  - `/lol-matchmaking/v1/ready-check/accept` (Auto-Accept)
  - `/lol-end-of-game/v1/eog-stats-block` (Post-Game-Stats)
- WebSocket-Events: `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase`, `OnJsonApiEvent_lol-champ-select_v1_session`.

### 4.1.1 Am laufenden Client verifiziert (01.09.2026, EUW, Patch 16.17)

- `/lol-match-history/v1/products/lol/{puuid}/matches` liefert für fremde Spieler 20 bis 40 Spiele mit genau
  einem Teilnehmer (der angefragte Spieler), inklusive `item0..6`, `perk0..5`, `perkPrimaryStyle`, `perkSubStyle`,
  `timeline.lane/role` (Werte wie `BOTTOM`/`CARRY`/`SUPPORT`). **`begIndex`/`endIndex` werden ignoriert**, jede
  Anfrage liefert denselben Block. Stat-Shards (`statPerk0..2`) fehlen.
- Für den **eigenen** Account liefert derselbe Endpunkt nur sehr wenige Spiele (im Test 1 bis 3). Die eigene
  Historie kommt deshalb über Match-V5 der Riot-API.
- `/lol-match-history/v1/games/{gameId}` liefert alle 10 Teilnehmer mit PUUID, Riot ID, Items und Runen.
- `/lol-ranked/v1/ranked-stats/{puuid}` funktioniert für fremde Spieler, meldet dort aber `losses: 0`
  (nur die Siege sind belastbar). Für den eigenen Account stimmen Siege und Niederlagen.
- `/lol-champion-mastery/v1/{puuid}/champion-mastery` liefert die komplette Liste fremder Spieler.
- `/lol-perks/v1/recommended-pages/champion/{id}/position/{POS}/map/11` liefert 2 bis 3 Seiten mit
  `keystone`, 9 `perks` (inkl. Shards) und `summonerSpellIds`. Position groß oder klein geschrieben funktioniert.
  `/lol-perks/v1/recommended-pages-position/champion/{id}` liefert nur einen String (Standardposition, ggf. leer).
- Runenseiten anlegen (`POST /lol-perks/v1/pages`) und löschen (`DELETE`, 204) funktioniert; `inventory.ownedPageCount`
  begrenzt die Anzahl.
- Item-Sets: Porofessor legt Sets als `type: custom, map: any, mode: any, associatedChampions: [id]` an; Poro nutzt
  dasselbe Format.
- **PUUIDs**: Der Client liefert 36-stellige UUIDs, die Riot-API verwendet 78-stellige verschlüsselte PUUIDs.
  Die Zuordnung läuft über `account/v1/accounts/by-riot-id/{gameName}/{tagLine}`.
- Riot-API-Limits des Development-Keys laut Header: `X-App-Rate-Limit: 100:120,20:1`.

### 4.2 Live Client Data API (In-Game, lokal)

- `https://127.0.0.1:2999/liveclientdata/…`, nur während eines laufenden Spiels, nur localhost, selbstsigniert.
- Endpunkte: `allgamedata`, `activeplayer`, `activeplayername`, `activeplayerabilities`, `activeplayerrunes`,
  `playerlist`, `playerscores?riotId=`, `playersummonerspells?riotId=`, `playermainrunes?riotId=`,
  `playeritems?riotId=`, `eventdata`, `gamestats`.
- Events (dokumentiert): GameStart, MinionsSpawning, FirstBrick, TurretKilled, InhibKilled, InhibRespawningSoon,
  InhibRespawned, DragonKill (DragonType), HeraldKill, BaronKill, ChampionKill, Multikill, Ace, FirstBlood, GameEnd.
  Events für Voidgrubs/Atakhan sind nicht in der alten Doku; im Spiel über
  `https://127.0.0.1:2999/swagger/v3/openapi.json` verifizieren.
- Nicht enthalten: Positionen, gegnerisches Gold, Jungle-Camp-Status, Cooldown-Zustände.

### 4.2.1 Umsetzung in Phase 3 (02.09.2026)

- Spawn-Regeln Season 2026 (Patch 26.x, Quelle: League-Wiki "Voidgrub camp", "Dragon pit", /dev Season One Preview):
  Drache 5:00 und alle 5:00 nach dem Kill; nach dem vierten Drachen eines Teams (Soul) spawnt der Älteste Drache
  6:00 nach dem Soul-Kill und alle 6:00 danach; Leerenbruten einmalig 8:00 bis 14:45 (3 Stück, kein zweiter
  Spawn); Herold 15:00 bis 19:45, kein Respawn; Baron 20:00 und 6:00 nach jedem Kill; Inhibitoren 5:00.
  Atakhan wurde mit Patch 26.01 entfernt. Die Werte stehen in `packages/core/src/objectives.ts` (`OBJECTIVE_RULES`)
  und sind pro Patch anpassbar.
- Die Timer werden aus den Kill-Events (`DragonKill`, `HordeKill`, `HeraldKill`, `BaronKill`, `InhibKilled`,
  `InhibRespawned`) plus Spielzeit berechnet. `HordeKill` für Leerenbruten stammt aus Overwolf-/Community-Quellen und
  ist im echten Spiel noch nicht bestätigt: unbekannte Event-Namen landen als `live client: unknown event` im Log.
- Team eines Killers: Spieler über `riotId`/`summonerName`, Einheiten über `Minion_T100…`/`Turret_T2_…`;
  Strukturnamen `Barracks_T1_C1` (T1 = blau, L/C/R = Top/Mid/Bot).
- Live-Stats: KP = (Kills + Assists) / Team-Kills; CS und Ward-Score werden beim ersten Poll ab Minute 10 und 20
  festgehalten (bis 45 s später, sonst kein Wert); "Itemwert" = Summe der Item-Preise, klar als Schätzung markiert.
- Fenstermodus: `<Install>Configgame.cfg`, `WindowMode` 0 = Vollbild, 1 = Fenster, 2 = Randlos. Im exklusiven
  Vollbild zeigt Poro einen Hinweis; das Overlay ist nur bei Randlos/Fenster sichtbar.

### 4.3 Riot Games API (Cloud)

- Account-V1 (Riot ID ↔ PUUID), Summoner-V4, League-V4 (by-puuid), Match-V5 (IDs, Match, Timeline inkl.
  `challenges`-Objekt mit Kennzahlen wie soloKills, visionScorePerMinute, damagePerMinute, turretTakedowns),
  Spectator-V5 (`/lol/spectator/v5/active-games/by-summoner/{puuid}`), Champion-Mastery-V4.
- Routing: Plattform (euw1, eun1, na1, kr, …) für Summoner/League/Spectator; Region (europe, americas, asia, sea)
  für Account und Match.
- Rate-Limits Development-Key: 20 Requests/1 s und 100 Requests/2 min, Key läuft nach 24 h ab.
  Personal-Key: gleiche Limits, läuft nicht ab, Registrierung ohne Prüfung. Production-Key: höhere Limits,
  Prototyp nötig, Prüfung ca. 2 Wochen bis mehrere Wochen.
- Regeln: Key nie in ausgelieferte Binaries einbauen, HTTPS, ein Produkt pro Key, Riot-Disclaimer anzeigen.
- Nicht verfügbar über die API: Brawl- und League-Classic-Daten (dürfen auch nicht angezeigt werden), Minor-Runen.

### 4.3.1 Umsetzung in Phase 4 (02.09.2026, echte Daten)

- Match-V5 und Timeline sind kurz nach Spielende abrufbar; Poro versucht es bis zu 9-mal im Abstand von 20 s,
  vorher kommt der Bericht aus dem Client (`/lol-match-history/v1/games/{gameId}`, alle 10 Teilnehmer, keine Timeline).
- `/lol-end-of-game/v1/eog-stats-block` liefert die gameId in der Phase EndOfGame; Fallback ist die Gameflow-Session.
- Timeline: ein Frame pro Minute mit `totalGold`, `xp`, `level`, `minionsKilled`, `jungleMinionsKilled` je Teilnehmer;
  Events `CHAMPION_KILL`, `ELITE_MONSTER_KILL` (`monsterType` DRAGON, BARON_NASHOR, RIFTHERALD, HORDE) und
  `BUILDING_KILL` (`buildingType`, `teamId` = Besitzer) mit `killerId` und `assistingParticipantIds`.
- Match-V5 versteckt manche Spielernamen (leer oder nur Ziffern); Poro zeigt dann den Champion.
- Riot-PUUID (Match-V5) und Client-PUUID unterscheiden sich; die Zuordnung läuft über Account-V1 per Riot ID.
- Spielhistorie in SQLite über das in Electron 44 (Node 24) eingebaute `node:sqlite`, daher kein natives Modul
  und kein Rebuild nötig.

### 4.3.2 Umsetzung in Phase 5 (02.09.2026, echte Daten)

- League-V4 liefert `puuid` direkt in den Ranglisten-Einträgen (`/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`
  ergab 300 Spieler); `summonerId` wird nicht mehr gebraucht.
- Match-IDs pro Spieler mit `queue=420&type=ranked&startTime=<14 Tage>` liefern 0 bis ~90 IDs; Matches anderer
  Patches werden verworfen (`info.gameVersion` → "16.17").
- Der Crawler läuft im Hauptprozess mit fester Taktung (Standard 40 Anfragen/Minute) statt am Limit, damit die
  Lobby-Analyse jederzeit Reserve hat. Ein Personal Key erlaubt 100 Anfragen pro 2 Minuten.
- Aggregation per SQL (GROUP BY champion_id, role), Builds pro Champion aus dessen Zeilen im Speicher; Tiers sind
  Perzentile eines Scores aus geschrumpfter Winrate, Pick- und Banrate innerhalb der Rolle.

### 4.4 Statische Daten

- Data Dragon (Champions, Items, Runen, Spells, Bilder, 25+ Sprachen; manuelles Update nach Patch).
- CommunityDragon (schneller aktuell, zusätzliche Assets, Perk-IDs).

### 4.5 Overlay und Vanguard

- Vanguard blockiert Speicherzugriff und Code-Injection, nicht separate Always-on-top-Fenster.
  Es gibt keine Whitelist. LCU- und Live-Client-Nutzung funktioniert weiter (ohne Support-Garantie).
- Ein transparentes Always-on-top-Fenster (Electron/Tauri) funktioniert nur im Modus
  **Borderless / Fenstermodus**, nicht im exklusiven Vollbild.
- Overwolf GEP (auch als `@overwolf/ow-electron`-Paket) liefert zusätzlich `jungle_camps`, Kills, Gold, Level,
  Damage usw. und Overlay im exklusiven Vollbild, benötigt aber Overwolf-Developer-Account und Freigabe
  für die Verteilung (Dev-Mode lokal frei nutzbar).

## 5. Riot-Policy-Checkliste für den Klon

1. Ranked Solo/Duo Champ Select: fremde Mitspieler nur als "Ally #n", keine Stats. Volle Analyse ab Ladebildschirm.
2. Keine Ultimate-Timer, keine gegnerischen Spell-/Ability-Cooldown-Timer, auch nicht manuell.
3. Keine Power-Spike-Benachrichtigungen und keine Handlungsanweisungen aus dem Spielzustand.
4. Kein Speicherlesen, keine Injection, kein Nachbauen der Riot-UI, keine Änderung der Spielziele.
5. Keine Brawl-/League-Classic-Daten.
6. Riot-Disclaimer ("isn't endorsed by Riot Games …") in der App anzeigen.
7. Bei Veröffentlichung: Projekt im Developer Portal registrieren, kostenloser Tier Pflicht, keine In-Game-Werbung.
