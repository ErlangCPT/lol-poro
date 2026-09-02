import type { LcuClient } from './client';
import type {
  GameflowPhase,
  LcuChampSelectSession,
  LcuChampionMastery,
  LcuEogStatsBlock,
  LcuGame,
  LcuGameflowSession,
  LcuItemSets,
  LcuMatchHistory,
  LcuMySelection,
  LcuPerkInventory,
  LcuPerkPage,
  LcuRankedStats,
  LcuRecommendedPage,
  LcuRegionLocale,
  LcuSummoner,
} from './types';

export const getGameflowPhase = (c: LcuClient) => c.get<GameflowPhase>('/lol-gameflow/v1/gameflow-phase');
export const getGameflowSession = (c: LcuClient) =>
  c.getOptional<LcuGameflowSession>('/lol-gameflow/v1/session');
export const getChampSelectSession = (c: LcuClient) =>
  c.getOptional<LcuChampSelectSession>('/lol-champ-select/v1/session');
export const getCurrentSummoner = (c: LcuClient) => c.get<LcuSummoner>('/lol-summoner/v1/current-summoner');
export const getSummonerByPuuid = (c: LcuClient, puuid: string) =>
  c.get<LcuSummoner>(`/lol-summoner/v2/summoners/puuid/${encodeURIComponent(puuid)}`);
export const getRankedStats = (c: LcuClient, puuid: string) =>
  c.get<LcuRankedStats>(`/lol-ranked/v1/ranked-stats/${encodeURIComponent(puuid)}`);
export const getMatchHistory = (c: LcuClient, puuid: string, begIndex: number, endIndex: number) =>
  c.get<LcuMatchHistory>(
    `/lol-match-history/v1/products/lol/${encodeURIComponent(puuid)}/matches?begIndex=${begIndex}&endIndex=${endIndex}`,
  );
export const getGame = (c: LcuClient, gameId: number) =>
  c.get<LcuGame>(`/lol-match-history/v1/games/${gameId}`);
export const getChampionMastery = (c: LcuClient, puuid: string) =>
  c.get<LcuChampionMastery[]>(`/lol-champion-mastery/v1/${encodeURIComponent(puuid)}/champion-mastery`);
export const getRegionLocale = (c: LcuClient) => c.get<LcuRegionLocale>('/riotclient/region-locale');
export const acceptReadyCheck = (c: LcuClient) => c.request('POST', '/lol-matchmaking/v1/ready-check/accept');
export const getEogStatsBlock = (c: LcuClient) =>
  c.getOptional<LcuEogStatsBlock>('/lol-end-of-game/v1/eog-stats-block');

// ---- runes ----
export const getRunePages = (c: LcuClient) => c.get<LcuPerkPage[]>('/lol-perks/v1/pages');
export const getCurrentRunePage = (c: LcuClient) => c.getOptional<LcuPerkPage>('/lol-perks/v1/currentpage');
export const getPerkInventory = (c: LcuClient) => c.get<LcuPerkInventory>('/lol-perks/v1/inventory');
export const createRunePage = (c: LcuClient, page: Partial<LcuPerkPage>) =>
  c.request<LcuPerkPage>('POST', '/lol-perks/v1/pages', page);
export const updateRunePage = (c: LcuClient, id: number, page: Partial<LcuPerkPage>) =>
  c.request<LcuPerkPage>('PUT', `/lol-perks/v1/pages/${id}`, page);
export const deleteRunePage = (c: LcuClient, id: number) => c.request('DELETE', `/lol-perks/v1/pages/${id}`);
/** Riot's own rune recommendations as shown in the client. Position is e.g. "MIDDLE"; map 11 = Summoner's Rift. */
export const getRecommendedRunePages = (c: LcuClient, championId: number, position: string, mapId = 11) =>
  c.get<LcuRecommendedPage[]>(
    `/lol-perks/v1/recommended-pages/champion/${championId}/position/${encodeURIComponent(position)}/map/${mapId}`,
  );
/** Returns the champion's default position as a string, e.g. "MIDDLE"; may be empty (verified against the live client). */
export const getRecommendedDefaultPosition = (c: LcuClient, championId: number) =>
  c.get<string>(`/lol-perks/v1/recommended-pages-position/champion/${championId}`);
/** championId -> { recommendedPositions: ["MIDDLE", "UTILITY"] } */
export const getRecommendedChampionPositions = (c: LcuClient) =>
  c.get<Record<string, { recommendedPositions: string[] }>>('/lol-perks/v1/recommended-champion-positions');

// ---- item sets ----
export const getItemSets = (c: LcuClient, summonerId: number) =>
  c.get<LcuItemSets>(`/lol-item-sets/v1/item-sets/${summonerId}/sets`);
export const putItemSets = (c: LcuClient, summonerId: number, sets: LcuItemSets) =>
  c.request('PUT', `/lol-item-sets/v1/item-sets/${summonerId}/sets`, sets);

// ---- champ select ----
export const patchMySelection = (c: LcuClient, selection: LcuMySelection) =>
  c.request('PATCH', '/lol-champ-select/v1/session/my-selection', selection);
