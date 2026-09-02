import type { Locale } from '@poro/core';
import type { ConnectionState, StaticDataPayload } from '@shared/ipc';
import type { ReactNode } from 'react';
import { championIcon, championName } from '../assets';
import { HeaderStatus } from './StatusBar';

/** Title row of a page: serif title, subtitle, optional lead element, controls and the connection status. */
export function PageHeader({
  title,
  subtitle,
  lead,
  state,
  locale,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  lead?: ReactNode;
  state?: ConnectionState;
  locale: Locale;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <h1 className="page-title">{title}</h1>
      {subtitle && <div className="page-sub">{subtitle}</div>}
      {lead}
      <div className="spacer" />
      {children}
      {state && <HeaderStatus state={state} locale={locale} />}
    </header>
  );
}

export function Card({
  className,
  children,
  pad = true,
}: {
  className?: string;
  children: ReactNode;
  pad?: boolean;
}) {
  return <section className={`card ${pad ? 'card-pad' : ''} ${className ?? ''}`}>{children}</section>;
}

/** Small uppercase label above a group of values. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

/** Champion portrait with a neutral placeholder while static data is missing. */
export function ChampIcon({
  sd,
  id,
  size = 32,
  round = false,
  className,
  title,
}: {
  sd: StaticDataPayload | null;
  id: number;
  size?: number;
  round?: boolean;
  className?: string;
  title?: string;
}) {
  const src = championIcon(sd, id);
  const name = championName(sd, id);
  const cls = `champ-img ${round ? 'round' : ''} ${className ?? ''}`;
  return src ? (
    <img className={cls} src={src} alt={name} title={title ?? name} width={size} height={size} />
  ) : (
    <span className={`${cls} champ-ph`} style={{ width: size, height: size }} title={title ?? name}>
      {id ? '' : '?'}
    </span>
  );
}

/** Generic icon image (spell, item, rune) with a placeholder box. */
export function Img({
  src,
  alt,
  size,
  className,
  round = false,
}: {
  src: string | undefined;
  alt: string;
  size: number;
  className?: string;
  round?: boolean;
}) {
  const cls = `${round ? 'round' : ''} ${className ?? ''}`;
  if (!src) return <span className={`ph ${cls}`} style={{ width: size, height: size }} title={alt} />;
  return <img className={cls} src={src} alt={alt} title={alt} width={size} height={size} />;
}

/** Win/loss split bar. */
export function WinBar({ winrate }: { winrate: number }) {
  const win = Math.max(0, Math.min(100, Math.round(winrate * 100)));
  return (
    <div className="bar" aria-hidden="true">
      <span className="bar-win" style={{ width: `${win}%` }} />
      <span className="bar-loss" style={{ width: `${100 - win}%` }} />
    </div>
  );
}

export function Skeleton({ width = '100%', height = 10 }: { width?: string | number; height?: number }) {
  return <span className="skeleton" style={{ width, height }} />;
}

export function Chip({
  tone = 'neutral',
  title,
  children,
  className,
  onClick,
}: {
  tone?: 'good' | 'bad' | 'neutral' | 'info' | 'premade-1' | 'premade-2' | 'premade-3' | 'plain' | 'gold';
  title?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <span className={`chip chip-${tone} ${className ?? ''}`} title={title} onClick={onClick}>
      {children}
    </span>
  );
}

/** Empty state with an icon, a title and a short explanation. */
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2>{title}</h2>
      {children}
    </div>
  );
}
