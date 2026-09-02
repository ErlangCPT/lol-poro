export type Platform =
  | 'euw1'
  | 'eun1'
  | 'na1'
  | 'kr'
  | 'br1'
  | 'jp1'
  | 'la1'
  | 'la2'
  | 'oc1'
  | 'tr1'
  | 'ru'
  | 'ph2'
  | 'sg2'
  | 'th2'
  | 'tw2'
  | 'vn2'
  | 'me1';

export type RegionRoute = 'europe' | 'americas' | 'asia' | 'sea';

const LCU_TO_PLATFORM: Record<string, Platform> = {
  EUW: 'euw1',
  EUNE: 'eun1',
  NA: 'na1',
  KR: 'kr',
  BR: 'br1',
  JP: 'jp1',
  LAN: 'la1',
  LAS: 'la2',
  OCE: 'oc1',
  OC1: 'oc1',
  TR: 'tr1',
  RU: 'ru',
  PH: 'ph2',
  SG: 'sg2',
  TH: 'th2',
  TW: 'tw2',
  VN: 'vn2',
  ME: 'me1',
};

/** Maps the LCU region string (e.g. "EUW") or a platform id ("euw1") to a Riot API platform. */
export function platformFromRegion(region: string | undefined): Platform {
  if (!region) return 'euw1';
  const upper = region.toUpperCase();
  if (LCU_TO_PLATFORM[upper]) return LCU_TO_PLATFORM[upper];
  const lower = region.toLowerCase() as Platform;
  return (Object.values(LCU_TO_PLATFORM) as string[]).includes(lower) ? lower : 'euw1';
}

export function regionRoute(platform: Platform): RegionRoute {
  switch (platform) {
    case 'euw1':
    case 'eun1':
    case 'tr1':
    case 'ru':
    case 'me1':
      return 'europe';
    case 'na1':
    case 'br1':
    case 'la1':
    case 'la2':
      return 'americas';
    case 'kr':
    case 'jp1':
      return 'asia';
    default:
      return 'sea';
  }
}

/** Match-V5 ids look like "EUW1_7969128321"; the numeric part is the LCU gameId. */
export function gameIdFromMatchId(matchId: string): number {
  const idx = matchId.indexOf('_');
  return Number(idx >= 0 ? matchId.slice(idx + 1) : matchId);
}
