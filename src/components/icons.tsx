import type { JSX, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function TelegramIcon(props: IconProps) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M21.94 4.3a1.2 1.2 0 0 0-1.62-1.3L2.9 9.76c-1.18.47-1.17 1.13-.21 1.42l4.47 1.4 1.7 5.24c.21.58.1.81.71.81.47 0 .68-.21.94-.47l2.26-2.2 4.7 3.47c.86.48 1.49.23 1.7-.8l3.08-14.52ZM8.6 12.27l9.66-6.1c.48-.3.92-.14.56.18l-8.27 7.46-.32 3.44-1.63-4.98Z" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2.6l2.4 11.6a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21 7H6" />
    </svg>
  );
}

export function CartPlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2.6l2.4 11.6a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21 7H6" />
      <path d="M13.5 8.5v4M11.5 10.5h4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

// ─── Иконки категорий: тонкие монохромные глифы вместо цветных эмодзи ─────────

const glyph = { ...base, strokeWidth: 1.8 } as const;

function DropGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M12 3.5c3.2 4 5.5 7.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-3 2.3-6.2 5.5-10.2Z" />
      <path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.3" />
    </svg>
  );
}

function BoltGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" />
    </svg>
  );
}

function PodGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <rect x="7.5" y="6" width="9" height="15" rx="2.5" />
      <path d="M10 6V3.5h4V6M12 15.5v.01" />
    </svg>
  );
}

function CoilGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M4 12h2.5c1.2 0 1.2-4 2.5-4s1.3 8 2.5 8 1.3-8 2.5-8 1.3 8 2.5 8 1.3-4 2.5-4H20" />
    </svg>
  );
}

function PuckGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <ellipse cx="12" cy="9" rx="8" ry="3.5" />
      <path d="M4 9v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V9" />
    </svg>
  );
}

function StripGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <rect x="4" y="7" width="16" height="10" rx="2" transform="rotate(-12 12 12)" />
      <path d="M9 10.8l6-1.3M9.6 13.8l4-.9" />
    </svg>
  );
}

function CottonGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M7 17a3.5 3.5 0 0 1-.6-6.95A5 5 0 0 1 16 8.4a4 4 0 0 1 1 7.9" />
      <path d="M7 17h10" />
    </svg>
  );
}

function HookahGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M12 3v3M9.5 6h5l-1 4h-3l-1-4ZM12 10v3" />
      <path d="M8.5 21a3.5 4 0 1 1 7 0Z" />
      <path d="M15.5 16c2 0 3.5-1 4.5-3" />
    </svg>
  );
}

function CanGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M8 4.5h8l1 2.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5V7l1-2.5Z" />
      <path d="M7 9h10M7 17h10" />
    </svg>
  );
}

function TagGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  );
}

function GiftGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
      <path d="M5 12.5v7.5h14v-7.5M12 8.5V20M12 8.5C10.5 5 7 4.5 7 6.8 7 8.5 12 8.5 12 8.5ZM12 8.5c1.5-3.5 5-4 5-1.7 0 1.7-5 1.7-5 1.7Z" />
    </svg>
  );
}

function GridGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

function HeartGlyph(props: IconProps) {
  return (
    <svg {...glyph} {...props}>
      <path d="M12 20s-7.5-4.4-7.5-10.1A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20Z" />
    </svg>
  );
}

const CATEGORY_GLYPHS: Record<string, (props: IconProps) => JSX.Element> = {
  all: GridGlyph,
  fav: HeartGlyph,
  promo: GiftGlyph,
  liquids: DropGlyph,
  freebase: DropGlyph,
  disposables: BoltGlyph,
  pods: PodGlyph,
  consumables: CoilGlyph,
  coils: CottonGlyph,
  snus: PuckGlyph,
  strips: StripGlyph,
  hookah: HookahGlyph,
  drinks: CanGlyph,
  sale: TagGlyph,
};

/** Иконка категории по её id; для новых листов — «бирка». */
export function CategoryIcon({ id, ...props }: IconProps & { id: string }) {
  const Glyph = CATEGORY_GLYPHS[id.replace(/-\d+$/, "")] ?? TagGlyph;
  return <Glyph {...props} />;
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M12 20s-7.5-4.4-7.5-10.1A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20Z" />
    </svg>
  );
}

export function RepeatIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11.5V10A4 4 0 0 1 7.5 6h13" />
      <path d="M7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" />
    </svg>
  );
}
