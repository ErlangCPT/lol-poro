import type { Locale, Localized } from './types';

export function t(text: Localized | undefined, locale: Locale): string {
  if (!text) return '';
  return text[locale] ?? text.en;
}

const TIER_LABEL: Record<string, Localized> = {
  IRON: { de: 'Eisen', en: 'Iron' },
  BRONZE: { de: 'Bronze', en: 'Bronze' },
  SILVER: { de: 'Silber', en: 'Silver' },
  GOLD: { de: 'Gold', en: 'Gold' },
  PLATINUM: { de: 'Platin', en: 'Platinum' },
  EMERALD: { de: 'Smaragd', en: 'Emerald' },
  DIAMOND: { de: 'Diamant', en: 'Diamond' },
  MASTER: { de: 'Meister', en: 'Master' },
  GRANDMASTER: { de: 'Großmeister', en: 'Grandmaster' },
  CHALLENGER: { de: 'Herausforderer', en: 'Challenger' },
  NONE: { de: 'Unranked', en: 'Unranked' },
};

export function tierLabel(tier: string | undefined, locale: Locale): string {
  if (!tier) return t(TIER_LABEL.NONE, locale);
  return t(TIER_LABEL[tier.toUpperCase()] ?? { de: tier, en: tier }, locale);
}

export function formatRank(
  tier: string | undefined,
  division: string | undefined,
  lp: number | undefined,
  locale: Locale,
): string {
  const tl = tierLabel(tier, locale);
  if (!tier || tier === 'NONE') return tl;
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier.toUpperCase());
  const div = apex || !division || division === 'NA' ? '' : ` ${division}`;
  return `${tl}${div}${lp !== undefined ? ` ${lp} LP` : ''}`;
}
