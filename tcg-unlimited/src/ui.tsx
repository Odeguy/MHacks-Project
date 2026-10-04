import type { ReactNode } from "react";

export type IconName =
  | "arrow"
  | "plus"
  | "search"
  | "grid"
  | "list"
  | "cards"
  | "spark"
  | "menu"
  | "close"
  | "chevron"
  | "bookmark"
  | "users"
  | "clock"
  | "dice"
  | "coin"
  | "field"
  | "check"
  | "copy"
  | "settings"
  | "play"
  | "minus";
const paths: Record<IconName, ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <rect x="14" y="14" width="6" height="6" />
    </>
  ),
  list: <path d="M8 5h12M8 12h12M8 19h12M4 5h.01M4 12h.01M4 19h.01" />,
  cards: (
    <>
      <rect x="8" y="4" width="12" height="16" rx="1" />
      <path d="M5 7H3v13a2 2 0 0 0 2 2h10M14 8v8M10 12h8" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z" />
      <path d="m19 3 .8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8Z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h10M4 17h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m8 5 7 7-7 7" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-4a6 6 0 0 1 12 0v4M17 5a3 3 0 0 1 0 6M19 21v-4a6 6 0 0 0-3-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  dice: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="6" />
      <path d="M12 8v8" />
    </>
  ),
  field: (
    <>
      <path d="m3 6 9-4 9 4v12l-9 4-9-4Z M3 6l9 4 9-4M12 10v12M7 4l10 4M7 8v12M17 8v12" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="1" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  settings: (
    <>
      <path d="M5 3v18M12 3v18M19 3v18M3 8h4M10 16h4M17 10h4" />
      <circle cx="5" cy="8" r="2" />
      <circle cx="12" cy="16" r="2" />
      <circle cx="19" cy="10" r="2" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8Z" />,
};
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="small-cross">+</span>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="cards" size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
