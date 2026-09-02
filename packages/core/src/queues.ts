import type { Localized } from './types';

/** Summoner's Rift 5v5 queues that count towards statistics (like Porofessor: normal + ranked). */
export const SR_5V5_QUEUES: ReadonlySet<number> = new Set([
  400, // Normal Draft
  420, // Ranked Solo/Duo
  430, // Normal Blind (legacy)
  440, // Ranked Flex
  480, // Swiftplay
  490, // Quickplay
  700, // Clash
]);

export const RANKED_QUEUES: ReadonlySet<number> = new Set([420, 440]);

export const QUEUE_NAMES: Record<number, Localized> = {
  0: { de: 'Benutzerdefiniert', en: 'Custom' },
  400: { de: 'Normal (Draft)', en: 'Normal Draft' },
  420: { de: 'Ranked Solo/Duo', en: 'Ranked Solo/Duo' },
  430: { de: 'Normal (Blind)', en: 'Normal Blind' },
  440: { de: 'Ranked Flex', en: 'Ranked Flex' },
  450: { de: 'ARAM', en: 'ARAM' },
  480: { de: 'Swiftplay', en: 'Swiftplay' },
  490: { de: 'Quickplay', en: 'Quickplay' },
  700: { de: 'Clash', en: 'Clash' },
  720: { de: 'ARAM Clash', en: 'ARAM Clash' },
  1700: { de: 'Arena', en: 'Arena' },
  1900: { de: 'URF', en: 'URF' },
};

export function queueName(queueId: number): Localized {
  return QUEUE_NAMES[queueId] ?? { de: `Queue ${queueId}`, en: `Queue ${queueId}` };
}

/** Ranked Solo/Duo hides non-party allies in champion select (Riot policy since patch 12.22). */
export function isAnonymisedChampSelect(queueId: number): boolean {
  return queueId === 420;
}
