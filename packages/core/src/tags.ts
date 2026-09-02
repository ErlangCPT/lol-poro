import { championStatsOf } from './aggregate';
import type {
  ChampionMastery,
  MatchSummary,
  PlayerIdentity,
  PlayerStats,
  RankedEntry,
  Role,
  Tag,
} from './types';

export interface TagContext {
  role: Role;
  championId: number;
  identity?: PlayerIdentity;
  stats?: PlayerStats;
  ranked?: RankedEntry[];
  mastery?: ChampionMastery[];
  /** matches in the statistic window, newest first (needed for opponent based tags) */
  matches?: MatchSummary[];
  /** all banned champions in this lobby */
  bans: number[];
  /** champions picked by the opposing team of this player */
  opposingChampionIds: number[];
  /** champion of the direct lane opponent, if known */
  laneOpponentChampionId?: number;
  championName: (championId: number) => string;
}

/** Benchmarks per role. Values are first estimates and should be calibrated with real data (Phase 5). */
export const BENCHMARKS: Record<
  Exclude<Role, 'UNKNOWN'>,
  { csGood: number; csBad: number; dmgHigh: number; dmgLow: number; visionGood: number; visionBad: number }
> = {
  TOP: { csGood: 7.0, csBad: 5.0, dmgHigh: 650, dmgLow: 350, visionGood: 1.0, visionBad: 0.5 },
  JUNGLE: { csGood: 5.5, csBad: 4.0, dmgHigh: 500, dmgLow: 280, visionGood: 1.3, visionBad: 0.7 },
  MIDDLE: { csGood: 7.5, csBad: 5.5, dmgHigh: 700, dmgLow: 400, visionGood: 1.0, visionBad: 0.5 },
  BOTTOM: { csGood: 7.5, csBad: 5.5, dmgHigh: 700, dmgLow: 400, visionGood: 1.0, visionBad: 0.5 },
  UTILITY: { csGood: Infinity, csBad: -Infinity, dmgHigh: 380, dmgLow: 150, visionGood: 2.2, visionBad: 1.2 },
};

const MIN_GAMES_PERFORMANCE = 5;

const f1 = (n: number) => n.toFixed(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;

function tag(
  id: string,
  tone: Tag['tone'],
  category: Tag['category'],
  label: Tag['label'],
  reason: Tag['reason'],
): Tag {
  return { id, tone, category, label, reason };
}

/** Computes the Porofessor-style tags of one lobby player. Pure function. */
export function computeTags(ctx: TagContext): Tag[] {
  const tags: Tag[] = [];
  const { stats, role } = ctx;
  const champ = ctx.championName(ctx.championId);
  const roleKnown = role !== 'UNKNOWN';
  const bench = roleKnown ? BENCHMARKS[role] : undefined;
  const isLaner = role === 'TOP' || role === 'MIDDLE' || role === 'BOTTOM';

  // ---- performance tags (need a minimum sample) ----
  if (stats && stats.games >= MIN_GAMES_PERFORMANCE && bench) {
    if (role !== 'UTILITY') {
      if (stats.csPerMin >= bench.csGood)
        tags.push(
          tag(
            'good-cser',
            'good',
            'farming',
            { de: 'Guter Farmer', en: 'Good CSer' },
            {
              de: `${f1(stats.csPerMin)} CS/min über ${stats.games} Spiele`,
              en: `${f1(stats.csPerMin)} CS/min over ${stats.games} games`,
            },
          ),
        );
      else if (stats.csPerMin <= bench.csBad)
        tags.push(
          tag(
            'bad-cser',
            'bad',
            'farming',
            { de: 'Schwacher Farmer', en: 'Bad CSer' },
            {
              de: `Nur ${f1(stats.csPerMin)} CS/min über ${stats.games} Spiele`,
              en: `Only ${f1(stats.csPerMin)} CS/min over ${stats.games} games`,
            },
          ),
        );
    }

    if (stats.dmgPerMin >= bench.dmgHigh)
      tags.push(
        tag(
          'high-damage',
          'good',
          'fighting',
          { de: 'Hoher Schaden', en: 'High Damage' },
          {
            de: `${Math.round(stats.dmgPerMin)} Schaden/min an Champions`,
            en: `${Math.round(stats.dmgPerMin)} damage/min to champions`,
          },
        ),
      );
    else if (stats.dmgPerMin <= bench.dmgLow)
      tags.push(
        tag(
          'low-damage',
          'bad',
          'fighting',
          { de: 'Wenig Schaden', en: 'Low Damage' },
          {
            de: `Nur ${Math.round(stats.dmgPerMin)} Schaden/min an Champions`,
            en: `Only ${Math.round(stats.dmgPerMin)} damage/min to champions`,
          },
        ),
      );

    if (isLaner) {
      if (stats.kda.kills >= 7)
        tags.push(
          tag(
            'aggressive-laner',
            'good',
            'fighting',
            { de: 'Aggressiver Laner', en: 'Aggressive Laner' },
            {
              de: `${f1(stats.kda.kills)} Kills pro Spiel`,
              en: `${f1(stats.kda.kills)} kills per game`,
            },
          ),
        );
      if (stats.kda.deaths >= 6.5)
        tags.push(
          tag(
            'vulnerable-laner',
            'bad',
            'fighting',
            { de: 'Anfälliger Laner', en: 'Vulnerable Laner' },
            {
              de: `${f1(stats.kda.deaths)} Tode pro Spiel`,
              en: `${f1(stats.kda.deaths)} deaths per game`,
            },
          ),
        );
    }
    if (role === 'JUNGLE' && (stats.kda.kills >= 6 || stats.kda.kills + stats.kda.assists >= 16))
      tags.push(
        tag(
          'aggressive-jungler',
          'good',
          'fighting',
          { de: 'Aggressiver Jungler', en: 'Aggressive Jungler' },
          {
            de: `${f1(stats.kda.kills)} Kills und ${f1(stats.kda.assists)} Assists pro Spiel`,
            en: `${f1(stats.kda.kills)} kills and ${f1(stats.kda.assists)} assists per game`,
          },
        ),
      );
    if (role === 'UTILITY' && stats.kda.kills + stats.kda.assists >= 15)
      tags.push(
        tag(
          'aggressive-support',
          'good',
          'fighting',
          { de: 'Aggressiver Support', en: 'Aggressive Support' },
          {
            de: `${f1(stats.kda.kills + stats.kda.assists)} Kills + Assists pro Spiel`,
            en: `${f1(stats.kda.kills + stats.kda.assists)} kills + assists per game`,
          },
        ),
      );

    if (typeof stats.killParticipation === 'number') {
      const kpHigh = role === 'JUNGLE' || role === 'UTILITY' ? 0.7 : 0.65;
      if (stats.killParticipation >= kpHigh)
        tags.push(
          tag(
            'high-kp',
            'good',
            'fighting',
            { de: 'Hohe Kill-Beteiligung', en: 'High Kill Participation' },
            {
              de: `${pct(stats.killParticipation)} Kill-Beteiligung`,
              en: `${pct(stats.killParticipation)} kill participation`,
            },
          ),
        );
    }

    if (role !== 'UTILITY' && (stats.turretKillsPerGame >= 1.5 || stats.turretDamagePerGame >= 7000))
      tags.push(
        tag(
          'turret-destroyer',
          'good',
          'objectives',
          { de: 'Turmzerstörer', en: 'Turret destroyer' },
          {
            de: `${f1(stats.turretKillsPerGame)} Türme und ${Math.round(stats.turretDamagePerGame)} Turmschaden pro Spiel`,
            en: `${f1(stats.turretKillsPerGame)} turrets and ${Math.round(stats.turretDamagePerGame)} turret damage per game`,
          },
        ),
      );

    if (
      (role === 'TOP' || role === 'MIDDLE') &&
      stats.turretDamagePerGame >= 9000 &&
      (stats.killParticipation === undefined || stats.killParticipation < 0.5)
    )
      tags.push(
        tag(
          'split-pusher',
          'neutral',
          'objectives',
          { de: 'Split Pusher', en: 'Split Pusher' },
          {
            de: `${Math.round(stats.turretDamagePerGame)} Turmschaden pro Spiel bei geringer Kill-Beteiligung`,
            en: `${Math.round(stats.turretDamagePerGame)} turret damage per game with low kill participation`,
          },
        ),
      );

    if (stats.visionPerMin >= bench.visionGood)
      tags.push(
        tag(
          'good-vision',
          'good',
          'vision',
          { de: 'Gute Vision', en: 'Good vision' },
          {
            de: `${f1(stats.visionPerMin)} Vision-Score/min, ${f1(stats.wardsPerMin)} Wards/min`,
            en: `${f1(stats.visionPerMin)} vision score/min, ${f1(stats.wardsPerMin)} wards/min`,
          },
        ),
      );
    else if (stats.visionPerMin <= bench.visionBad)
      tags.push(
        tag(
          'bad-vision',
          'bad',
          'vision',
          { de: 'Schlechte Vision', en: 'Bad vision' },
          {
            de: `Nur ${f1(stats.visionPerMin)} Vision-Score/min, ${f1(stats.wardsPerMin)} Wards/min`,
            en: `Only ${f1(stats.visionPerMin)} vision score/min, ${f1(stats.wardsPerMin)} wards/min`,
          },
        ),
      );
  }

  // ---- champion tags ----
  const cs = championStatsOf(stats, ctx.championId);
  const masteryEntry = ctx.mastery?.find((m) => m.championId === ctx.championId);

  if (cs && cs.games >= 10 && cs.winrate >= 0.6 && cs.kdaRatio >= 4)
    tags.push(
      tag(
        'godlike',
        'good',
        'champion',
        { de: `Godlike ${champ}`, en: `Godlike ${champ}` },
        {
          de: `${pct(cs.winrate)} Winrate und ${f1(cs.kdaRatio)} KDA in ${cs.games} Spielen`,
          en: `${pct(cs.winrate)} win rate and ${f1(cs.kdaRatio)} KDA in ${cs.games} games`,
        },
      ),
    );

  if (stats && cs && stats.games >= 15 && cs.games / stats.games >= 0.5)
    tags.push(
      tag(
        'otp',
        'good',
        'champion',
        { de: `OTP ${champ}`, en: `OTP ${champ}` },
        {
          de: `${cs.games} von ${stats.games} Spielen auf ${champ}`,
          en: `${cs.games} of ${stats.games} games on ${champ}`,
        },
      ),
    );
  else if (stats && cs && stats.games >= 10 && cs.games / stats.games >= 0.3)
    tags.push(
      tag(
        'lover',
        'neutral',
        'champion',
        { de: `${champ}-Liebhaber`, en: `${champ} lover` },
        {
          de: `${cs.games} von ${stats.games} Spielen auf ${champ}`,
          en: `${cs.games} of ${stats.games} games on ${champ}`,
        },
      ),
    );

  if (masteryEntry && masteryEntry.points >= 1_000_000)
    tags.push(
      tag(
        'millionaire',
        'good',
        'champion',
        { de: `Millionär: ${champ}`, en: `Millionaire: ${champ}` },
        {
          de: `${Math.round(masteryEntry.points / 1000)}k Meisterschaftspunkte`,
          en: `${Math.round(masteryEntry.points / 1000)}k mastery points`,
        },
      ),
    );

  if (
    stats &&
    stats.games >= 5 &&
    !cs &&
    (!masteryEntry || masteryEntry.level <= 1 || masteryEntry.points < 5000)
  )
    tags.push(
      tag(
        'first-time',
        'bad',
        'champion',
        { de: `Erstes Mal ${champ}`, en: `First time ${champ}` },
        {
          de: `Kein Spiel auf ${champ} in den letzten ${stats.windowDays} Tagen, ${masteryEntry ? masteryEntry.points : 0} Meisterschaftspunkte`,
          en: `No game on ${champ} in the last ${stats.windowDays} days, ${masteryEntry ? masteryEntry.points : 0} mastery points`,
        },
      ),
    );

  if (ctx.laneOpponentChampionId && ctx.matches) {
    const opp = ctx.laneOpponentChampionId;
    const vs = ctx.matches.filter((m) => m.opponents?.some((o) => o.championId === opp && o.role === m.role));
    const wins = vs.filter((m) => m.win).length;
    if (vs.length >= 3 && wins / vs.length >= 0.66)
      tags.push(
        tag(
          'stomper',
          'good',
          'champion',
          { de: `${ctx.championName(opp)}-Stomper`, en: `${ctx.championName(opp)} stomper` },
          {
            de: `${wins} von ${vs.length} Spielen gegen ${ctx.championName(opp)} gewonnen`,
            en: `Won ${wins} of ${vs.length} games against ${ctx.championName(opp)}`,
          },
        ),
      );
  }

  // ---- form ----
  if (stats?.streak && stats.streak.length >= 3) {
    if (stats.streak.type === 'win')
      tags.push(
        tag(
          'hot-streak',
          'good',
          'form',
          { de: 'Siegesserie', en: 'Hot Streak' },
          {
            de: `${stats.streak.length} Siege in Folge`,
            en: `${stats.streak.length} wins in a row`,
          },
        ),
      );
    else
      tags.push(
        tag(
          'cold-streak',
          'bad',
          'form',
          { de: 'Niederlagenserie', en: 'Cold Streak' },
          {
            de: `${stats.streak.length} Niederlagen in Folge`,
            en: `${stats.streak.length} losses in a row`,
          },
        ),
      );
  }
  if (stats && stats.last12h.games >= 8)
    tags.push(
      tag(
        'marathon',
        'neutral',
        'form',
        { de: 'Marathon', en: 'Marathon' },
        {
          de: `${stats.last12h.games} Spiele in den letzten 12 Stunden`,
          en: `${stats.last12h.games} games in the last 12 hours`,
        },
      ),
    );

  // ---- meta ----
  const main = stats?.perChampion[0];
  if (
    stats &&
    main &&
    main.games >= 5 &&
    main.games / stats.games >= 0.25 &&
    main.championId !== ctx.championId
  ) {
    const mainName = ctx.championName(main.championId);
    if (ctx.bans.includes(main.championId))
      tags.push(
        tag(
          'main-banned',
          'bad',
          'meta',
          { de: 'Main gebannt', en: 'Main banned' },
          {
            de: `${mainName} (${main.games} Spiele) wurde gebannt`,
            en: `${mainName} (${main.games} games) was banned`,
          },
        ),
      );
    else if (ctx.opposingChampionIds.includes(main.championId))
      tags.push(
        tag(
          'main-picked',
          'bad',
          'meta',
          { de: 'Main vom Gegner gepickt', en: 'Main Picked by enemy' },
          {
            de: `${mainName} (${main.games} Spiele) spielt im Gegnerteam`,
            en: `${mainName} (${main.games} games) is on the enemy team`,
          },
        ),
      );
  }

  if (stats && roleKnown && stats.mainRoles.length > 0 && !stats.mainRoles.includes(role)) {
    const share = stats.roles.find((r) => r.role === role)?.share ?? 0;
    if (share < 0.15)
      tags.push(
        tag(
          'off-role',
          'bad',
          'meta',
          { de: 'Off-Role', en: 'Off-role' },
          {
            de: `Nur ${pct(share)} der Spiele auf dieser Rolle, Hauptrollen: ${stats.mainRoles.join(', ')}`,
            en: `Only ${pct(share)} of games in this role, main roles: ${stats.mainRoles.join(', ')}`,
          },
        ),
      );
  }

  if (
    stats &&
    ctx.identity?.level !== undefined &&
    ctx.identity.level < 60 &&
    stats.games >= 15 &&
    stats.winrate >= 0.65
  )
    tags.push(
      tag(
        'smurf',
        'info',
        'meta',
        { de: 'Smurf?', en: 'Smurf?' },
        {
          de: `Level ${ctx.identity.level} mit ${pct(stats.winrate)} Winrate in ${stats.games} Spielen`,
          en: `Level ${ctx.identity.level} with ${pct(stats.winrate)} win rate in ${stats.games} games`,
        },
      ),
    );

  return tags;
}
