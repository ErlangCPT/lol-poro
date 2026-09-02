import type { Role } from '@poro/core';
import type { SVGProps } from 'react';

/** Line icons on a 24 px grid; colour follows `currentColor`. */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & { size?: number; strokeWidth?: number };

function Svg({ size = 20, strokeWidth = 1.8, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconLobby = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M15.5 13.2c2.8.3 5 2.7 5 5.8" />
  </Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19V5" />
    <path d="M4 19h16" />
    <path d="M7 15l4-5 3 3 5-7" />
  </Svg>
);
export const IconBars = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20h14" />
    <path d="M7 20V9" />
    <path d="M12 20V4" />
    <path d="M17 20v-8" />
  </Svg>
);
export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const IconPulse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h4l2-6 4 12 2-6h6" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconUnlock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.3-4.3" />
  </Svg>
);
export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </Svg>
);
export const IconSwords = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l11 11" />
    <path d="M14 14l4 4" />
    <path d="M21 3L10 14" />
    <path d="M10 14l-4 4" />
    <path d="M4 20l2-2" />
    <path d="M20 20l-2-2" />
  </Svg>
);
export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3.5.5 1 1 1.5 2 1.5 0-3 1-5 1-7z" />
  </Svg>
);
export const IconCrown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 17l-1-9 5 4 4-6 4 6 5-4-1 9z" />
    <path d="M4 20h16" />
  </Svg>
);
export const IconBug = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="5" />
    <path d="M12 8V5" />
    <path d="M8 4l2 2" />
    <path d="M16 4l-2 2" />
    <path d="M4 13h3" />
    <path d="M17 13h3" />
    <path d="M6 19l2-2" />
    <path d="M18 19l-2-2" />
  </Svg>
);
export const IconTower = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 21V9h8v12" />
    <path d="M6 9l6-5 6 5" />
    <path d="M5 21h14" />
    <path d="M11 21v-4h2v4" />
  </Svg>
);
export const IconGem = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10l4 5-9 12L3 9z" />
    <path d="M3 9h18" />
    <path d="M9 4l3 5 3-5" />
  </Svg>
);
export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </Svg>
);
export const IconTrend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);
export const IconCoins = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5" />
    <path d="M14.5 10.5a5 5 0 1 1-6 6" />
  </Svg>
);
export const IconTarget = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4" />
    <path d="M12 18v4" />
    <path d="M2 12h4" />
    <path d="M18 12h4" />
  </Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5" />
    <path d="M12 18h.01" />
  </Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 13l4 4L19 7" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
);
export const IconMap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
    <path d="M9 4v14" />
    <path d="M15 6v14" />
  </Svg>
);
export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
  </Svg>
);
export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4l13 8-13 8z" />
  </Svg>
);
export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </Svg>
);

/** Filled role glyphs on a 10 px grid (top, jungle, mid, bot, support). */
export function RoleIcon({ role, size = 10, className }: { role: Role; size?: number; className?: string }) {
  let body;
  switch (role) {
    case 'TOP':
      body = (
        <>
          <path d="M1 1h6v2H3v6H1z" />
          <path d="M5 5h4v4H5z" opacity="0.5" />
        </>
      );
      break;
    case 'JUNGLE':
      body = <path d="M5 1c2 2 3 4 3 8-1-1-2-1.5-3-1.5S3 8 2 9c0-4 1-6 3-8z" />;
      break;
    case 'MIDDLE':
      body = (
        <>
          <path d="M1 9L9 1v3L4 9z" />
          <path d="M1 1h3L1 4z" opacity="0.5" />
          <path d="M9 9H6l3-3z" opacity="0.5" />
        </>
      );
      break;
    case 'BOTTOM':
      body = (
        <>
          <path d="M9 9H3V7h4V1h2z" />
          <path d="M1 1h4v4H1z" opacity="0.5" />
        </>
      );
      break;
    case 'UTILITY':
      body = <path d="M5 1l1.3 2.7L9 4l-2 2 .5 3L5 7.6 2.5 9 3 6 1 4l2.7-.3z" />;
      break;
    default:
      body = <circle cx="5" cy="5" r="1.4" />;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  );
}

export type ObjectiveKind = 'dragon' | 'elder' | 'grubs' | 'herald' | 'baron' | 'inhibitor' | 'turret';

export function ObjectiveIcon({ kind, size = 14 }: { kind: ObjectiveKind; size?: number }) {
  const p = { size, strokeWidth: 2 };
  switch (kind) {
    case 'dragon':
      return <IconFlame {...p} />;
    case 'elder':
      return <IconGem {...p} />;
    case 'grubs':
      return <IconBug {...p} />;
    case 'herald':
      return <IconEye {...p} />;
    case 'baron':
      return <IconCrown {...p} />;
    case 'inhibitor':
    case 'turret':
      return <IconTower {...p} />;
  }
}

/** Colour of a dragon type (Live Client Data names). */
export const DRAGON_COLOR: Record<string, string> = {
  Fire: '#ef4444',
  Earth: '#d97706',
  Water: '#38bdf8',
  Air: '#cbd5e1',
  Hextech: '#22d3ee',
  Chemtech: '#84cc16',
  Elder: '#a78bfa',
  Unknown: '#8b95a8',
};
