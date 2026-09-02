import type { Locale, Tag, TagCategory } from '@poro/core';
import { t } from '@poro/core';
import type { ReactNode } from 'react';
import {
  IconBars,
  IconCoins,
  IconEye,
  IconLobby,
  IconStar,
  IconSwords,
  IconTarget,
  IconTrend,
} from './icons';

const CATEGORY_ICON: Record<TagCategory, (size: number) => ReactNode> = {
  farming: (s) => <IconCoins size={s} strokeWidth={2.2} />,
  fighting: (s) => <IconSwords size={s} strokeWidth={2.2} />,
  objectives: (s) => <IconTarget size={s} strokeWidth={2.2} />,
  vision: (s) => <IconEye size={s} strokeWidth={2.2} />,
  champion: (s) => <IconStar size={s} strokeWidth={2.2} />,
  form: (s) => <IconTrend size={s} strokeWidth={2.2} />,
  meta: (s) => <IconBars size={s} strokeWidth={2.2} />,
  team: (s) => <IconLobby size={s} strokeWidth={2.2} />,
};

export function TagChip({ tag, locale }: { tag: Tag; locale: Locale }) {
  return (
    <span className={`chip chip-${tag.tone}`} title={t(tag.reason, locale)}>
      {CATEGORY_ICON[tag.category](11)}
      {t(tag.label, locale)}
    </span>
  );
}

/** Tag chips; with `max` the rest is folded into a "+n" chip whose tooltip lists them. */
export function TagList({
  tags,
  locale,
  max,
  className,
}: {
  tags: Tag[];
  locale: Locale;
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = max ? tags.slice(max) : [];
  return (
    <div className={`tags ${className ?? ''}`}>
      {shown.map((tag) => (
        <TagChip key={tag.id} tag={tag} locale={locale} />
      ))}
      {rest.length > 0 && (
        <span className="chip chip-plain" title={rest.map((r) => t(r.label, locale)).join(', ')}>
          +{rest.length}
        </span>
      )}
    </div>
  );
}

/** Tags with their reasons, for detail views. */
export function TagReasons({ tags, locale }: { tags: Tag[]; locale: Locale }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tag-reasons">
      {tags.map((tag) => (
        <li key={tag.id}>
          <span className={`chip chip-${tag.tone}`}>
            {CATEGORY_ICON[tag.category](11)}
            {t(tag.label, locale)}
          </span>
          <span className="muted small">{t(tag.reason, locale)}</span>
        </li>
      ))}
    </ul>
  );
}
