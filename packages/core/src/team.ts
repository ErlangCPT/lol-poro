import { kdaRatio } from './aggregate';
import type { ChampionInfo, ChampionTraits, LobbyPlayer, Tag, TeamStats } from './types';

/**
 * Manual corrections for champions whose Data Dragon tags do not describe their team role well.
 * Keyed by Data Dragon champion key. Values 0..2. Extend freely; unknown champions fall back to heuristics.
 */
export const TRAIT_OVERRIDES: Record<string, Partial<ChampionTraits>> = {
  Aatrox: { frontline: 2, dive: 1 },
  Ahri: { backline: 1, engage: 0 },
  Akali: { backline: 2, dive: 2 },
  Alistar: { engage: 2, frontline: 2, disengage: 1 },
  Amumu: { engage: 2, frontline: 2 },
  Anivia: { waveclear: 2, disengage: 2, siege: 1 },
  Ashe: { engage: 1, siege: 1 },
  AurelionSol: { waveclear: 2, siege: 1 },
  Bard: { engage: 1, disengage: 1 },
  Blitzcrank: { engage: 1, frontline: 1 },
  Braum: { frontline: 2, disengage: 2, engage: 0 },
  Caitlyn: { siege: 2 },
  Camille: { dive: 2, splitpush: 2, backline: 1 },
  Chogath: { frontline: 2, waveclear: 1 },
  Darius: { frontline: 2, splitpush: 1 },
  Diana: { dive: 2, engage: 1, backline: 1 },
  DrMundo: { frontline: 2, splitpush: 1 },
  Ekko: { dive: 1, backline: 1 },
  Ezreal: { siege: 1 },
  Fiora: { splitpush: 2, dive: 1 },
  Fizz: { backline: 2, dive: 1 },
  Galio: { engage: 2, frontline: 2, disengage: 1 },
  Gnar: { engage: 2, frontline: 1, splitpush: 1 },
  Gragas: { engage: 2, disengage: 1, frontline: 1 },
  Hecarim: { engage: 2, dive: 2 },
  Illaoi: { splitpush: 1, frontline: 1 },
  Irelia: { dive: 2, splitpush: 1 },
  JarvanIV: { engage: 2, dive: 2, frontline: 1 },
  Jax: { splitpush: 2, dive: 1 },
  Jayce: { siege: 2, waveclear: 1 },
  Janna: { disengage: 2, engage: 0 },
  Karthus: { waveclear: 2 },
  Kassadin: { backline: 2 },
  Katarina: { backline: 2, dive: 2 },
  Kayn: { dive: 2, backline: 1 },
  Kennen: { engage: 2 },
  Kled: { engage: 2, dive: 1, splitpush: 1 },
  Leblanc: { backline: 2 },
  LeeSin: { engage: 1, dive: 1 },
  Leona: { engage: 2, frontline: 2 },
  Lulu: { disengage: 1 },
  Malphite: { engage: 2, frontline: 2 },
  Malzahar: { waveclear: 2, siege: 1 },
  Maokai: { engage: 2, frontline: 2 },
  Mordekaiser: { frontline: 1, dive: 1, splitpush: 1 },
  Morgana: { disengage: 1 },
  Nasus: { splitpush: 2, frontline: 1 },
  Nautilus: { engage: 2, frontline: 2 },
  Nocturne: { dive: 2, backline: 2 },
  Nunu: { engage: 1, frontline: 1 },
  Ornn: { engage: 2, frontline: 2 },
  Pantheon: { dive: 1, engage: 1 },
  Poppy: { frontline: 2, disengage: 2 },
  Pyke: { backline: 1, engage: 1 },
  Rakan: { engage: 2, disengage: 1 },
  Rammus: { engage: 2, frontline: 2 },
  Rell: { engage: 2, frontline: 2 },
  Renekton: { dive: 1, frontline: 1 },
  Rengar: { backline: 2, dive: 1 },
  Riven: { dive: 1, splitpush: 1 },
  Ryze: { waveclear: 1, splitpush: 1 },
  Samira: { dive: 1 },
  Sejuani: { engage: 2, frontline: 2 },
  Shen: { frontline: 2, splitpush: 2 },
  Sion: { frontline: 2, engage: 1, waveclear: 2 },
  Skarner: { engage: 2, frontline: 2 },
  Swain: { frontline: 1, waveclear: 1 },
  Sylas: { dive: 1, engage: 1 },
  Talon: { backline: 2 },
  Taric: { frontline: 1, disengage: 1 },
  Thresh: { engage: 1, disengage: 1 },
  Tristana: { dive: 1, siege: 2 },
  Tryndamere: { splitpush: 2, dive: 1 },
  TwistedFate: { waveclear: 1, splitpush: 1 },
  Urgot: { frontline: 2 },
  Velkoz: { siege: 2 },
  Vi: { dive: 2, engage: 1 },
  Volibear: { engage: 1, dive: 1, frontline: 1 },
  Warwick: { dive: 1, frontline: 1 },
  MonkeyKing: { engage: 2, frontline: 1 },
  Xerath: { siege: 2 },
  Yasuo: { dive: 1 },
  Yone: { dive: 1, engage: 1 },
  Yorick: { splitpush: 2 },
  Zac: { engage: 2, dive: 2, frontline: 2 },
  Zed: { backline: 2 },
  Ziggs: { siege: 2, waveclear: 2 },
  Zilean: { disengage: 1 },
};

/** Derives approximate team-fight traits from Data Dragon tags/info plus manual overrides. */
export function deriveTraits(info: ChampionInfo): ChampionTraits {
  const t: ChampionTraits = {
    frontline: 0,
    engage: 0,
    dive: 0,
    backline: 0,
    waveclear: 0,
    siege: 0,
    splitpush: 0,
    disengage: 0,
    melee: info.attackRange < 300,
    damageType: 'MIXED',
  };
  for (const tagName of info.tags) {
    switch (tagName) {
      case 'Tank':
        t.frontline = Math.max(t.frontline, 2);
        t.engage = Math.max(t.engage, 1);
        t.dive = Math.max(t.dive, 1);
        break;
      case 'Fighter':
        t.frontline = Math.max(t.frontline, 1);
        t.splitpush = Math.max(t.splitpush, 1);
        t.dive = Math.max(t.dive, 1);
        break;
      case 'Assassin':
        t.backline = Math.max(t.backline, 2);
        t.dive = Math.max(t.dive, 1);
        break;
      case 'Mage':
        t.waveclear = Math.max(t.waveclear, 2);
        t.siege = Math.max(t.siege, 1);
        t.disengage = Math.max(t.disengage, 1);
        break;
      case 'Marksman':
        t.siege = Math.max(t.siege, 2);
        t.waveclear = Math.max(t.waveclear, 1);
        break;
      case 'Support':
        if (info.info.defense >= 6) {
          t.engage = Math.max(t.engage, 1);
          t.frontline = Math.max(t.frontline, 1);
        }
        break;
    }
  }
  if (info.info.magic >= info.info.attack + 2) t.damageType = 'AP';
  else if (info.info.attack >= info.info.magic + 2) t.damageType = 'AD';
  const override = TRAIT_OVERRIDES[info.key];
  return override ? { ...t, ...override } : t;
}

function teamTag(id: string, tone: Tag['tone'], label: Tag['label'], reason: Tag['reason']): Tag {
  return { id, tone, category: 'team', label, reason };
}

export function computeTeamTags(traits: ChampionTraits[]): Tag[] {
  if (traits.length === 0) return [];
  const sum = (k: keyof Omit<ChampionTraits, 'melee' | 'damageType'>) => traits.reduce((a, t) => a + t[k], 0);
  const frontline = sum('frontline');
  const engage = sum('engage');
  const dive = sum('dive');
  const backline = sum('backline');
  const waveclear = sum('waveclear');
  const siege = sum('siege');
  const splitpush = sum('splitpush');
  const depush = waveclear + sum('disengage');
  const melee = traits.filter((t) => t.melee).length;
  const ap = traits.filter((t) => t.damageType === 'AP').length;
  const ad = traits.filter((t) => t.damageType === 'AD').length;
  const n = traits.length;
  const tags: Tag[] = [];
  const val = (v: number) => ({
    de: `Wert ${v} über ${n} Champions`,
    en: `Score ${v} across ${n} champions`,
  });

  if (frontline >= 4)
    tags.push(
      teamTag('team-frontline-good', 'good', { de: 'Gute Frontline', en: 'Good frontline' }, val(frontline)),
    );
  else if (frontline <= 1)
    tags.push(
      teamTag(
        'team-frontline-weak',
        'bad',
        { de: 'Schwache Frontline', en: 'Weak frontline' },
        val(frontline),
      ),
    );
  if (engage >= 4)
    tags.push(teamTag('team-engage-good', 'good', { de: 'Gutes Engage', en: 'Good engage' }, val(engage)));
  else if (engage <= 1)
    tags.push(teamTag('team-engage-weak', 'bad', { de: 'Schwaches Engage', en: 'Weak engage' }, val(engage)));
  if (dive >= 5)
    tags.push(teamTag('team-dive-great', 'good', { de: 'Starkes Dive', en: 'Great dive' }, val(dive)));
  else if (dive >= 3)
    tags.push(teamTag('team-dive-good', 'good', { de: 'Gutes Dive', en: 'Good dive' }, val(dive)));
  if (backline >= 3)
    tags.push(
      teamTag(
        'team-backline',
        'good',
        { de: 'Starker Backline-Zugriff', en: 'Great backline access' },
        val(backline),
      ),
    );
  if (waveclear >= 5)
    tags.push(
      teamTag('team-waveclear-good', 'good', { de: 'Guter Waveclear', en: 'Good waveclear' }, val(waveclear)),
    );
  else if (waveclear <= 2)
    tags.push(
      teamTag(
        'team-waveclear-weak',
        'bad',
        { de: 'Schwacher Waveclear', en: 'Weak waveclear' },
        val(waveclear),
      ),
    );
  if (siege >= 4)
    tags.push(teamTag('team-siege', 'good', { de: 'Gute Belagerung', en: 'Good siege' }, val(siege)));
  if (splitpush >= 2)
    tags.push(
      teamTag(
        'team-splitpush',
        'neutral',
        { de: 'Splitpush-Potenzial', en: 'Splitpush potential' },
        val(splitpush),
      ),
    );
  if (depush >= 5)
    tags.push(teamTag('team-depush-good', 'good', { de: 'Gutes Depush', en: 'Good depush' }, val(depush)));
  else if (depush <= 2)
    tags.push(teamTag('team-depush-bad', 'bad', { de: 'Schwaches Depush', en: 'Bad depush' }, val(depush)));
  if (engage >= 3 && frontline >= 2)
    tags.push(
      teamTag(
        'team-gank-setup',
        'good',
        { de: 'Gutes Gank-Setup', en: 'Good gank setup' },
        val(engage + frontline),
      ),
    );
  if (n >= 4 && melee <= 1)
    tags.push(
      teamTag(
        'team-melee-low',
        'bad',
        { de: 'Zu wenig Nahkampf', en: 'Not enough Melee' },
        { de: `${melee} Nahkämpfer`, en: `${melee} melee champions` },
      ),
    );
  else if (n >= 4 && melee >= 4)
    tags.push(
      teamTag(
        'team-melee-high',
        'bad',
        { de: 'Zu viel Nahkampf', en: 'Too many Melee' },
        { de: `${melee} Nahkämpfer`, en: `${melee} melee champions` },
      ),
    );
  if (n >= 4 && ap >= 4)
    tags.push(
      teamTag(
        'team-full-ap',
        'bad',
        { de: 'Fast nur AP', en: 'Full AP' },
        { de: `${ap} AP-Champions`, en: `${ap} AP champions` },
      ),
    );
  else if (n >= 4 && ad >= 4)
    tags.push(
      teamTag(
        'team-full-ad',
        'bad',
        { de: 'Fast nur AD', en: 'Full AD' },
        { de: `${ad} AD-Champions`, en: `${ad} AD champions` },
      ),
    );
  return tags;
}

export function computeTeamStats(
  players: LobbyPlayer[],
  championInfo: (championId: number) => ChampionInfo | undefined,
): TeamStats {
  const withStats = players.filter((p) => p.stats && p.stats.games > 0);
  const n = withStats.length;
  const avg = (f: (p: LobbyPlayer) => number) =>
    n > 0 ? withStats.reduce((a, p) => a + f(p), 0) / n : undefined;
  const traits = players
    .map((p) => (p.championId > 0 ? championInfo(p.championId) : undefined))
    .filter((c): c is ChampionInfo => !!c)
    .map(deriveTraits);
  const k = avg((p) => p.stats!.kda.kills);
  const d = avg((p) => p.stats!.kda.deaths);
  const a = avg((p) => p.stats!.kda.assists);
  return {
    playersWithData: n,
    avgWinrate: avg((p) => p.stats!.winrate),
    avgKda:
      k !== undefined && d !== undefined && a !== undefined
        ? { kills: k, deaths: d, assists: a, ratio: kdaRatio(k, d, a) }
        : undefined,
    avgGoldPerMin: avg((p) => p.stats!.goldPerMin),
    avgDmgPerMin: avg((p) => p.stats!.dmgPerMin),
    avgWardsPerMin: avg((p) => p.stats!.wardsPerMin),
    tags: computeTeamTags(traits),
  };
}
