import type { CSSProperties, ReactElement } from "react";

/**
 * Phosphor-style icon primitive — single-weight outline at 16 stroke width on
 * a 256 viewBox, matching the 2026 design refresh. The `name` union is
 * intentionally kept tight to what the app actually renders; adding a new
 * glyph is a one-line change to `PATHS`.
 */

export type IconName =
  | "arrowLeft"
  | "arrowRight"
  | "arrowUpRight"
  | "check"
  | "chevron"
  | "chevronDown"
  | "chevronUp"
  | "clock"
  | "close"
  | "command"
  | "dot"
  | "download"
  | "duplicate"
  | "edit"
  | "eye"
  | "filter"
  | "folder"
  | "folderOpen"
  | "hardDrive"
  | "home"
  | "info"
  | "link"
  | "missing"
  | "more"
  | "move"
  | "photo"
  | "plus"
  | "refresh"
  | "scan"
  | "search"
  | "settings"
  | "sidebar"
  | "sort"
  | "sparkle"
  | "tag"
  | "trash"
  | "upload"
  | "user"
  | "warning";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  title?: string;
}

export function Icon({
  name,
  size = 16,
  color = "currentColor",
  className,
  style,
  strokeWidth = 16,
  title
}: IconProps) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, display: "inline-block", ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {path(color)}
    </svg>
  );
}

type PathBuilder = (color: string) => ReactElement;

const PATHS: Record<IconName, PathBuilder> = {
  folder: () => (
    <path d="M32,72V64a8,8,0,0,1,8-8H92.69a8,8,0,0,1,5.65,2.34L115.31,75.31a8,8,0,0,0,5.66,2.34H216a8,8,0,0,1,8,8V200a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V80" />
  ),
  folderOpen: () => (
    <>
      <path d="M245.66,106.41,226.33,200a16,16,0,0,1-15.66,12.68H45.34A16,16,0,0,1,29.68,200L20.34,106.34A8,8,0,0,1,28.32,96.3h199.4A8,8,0,0,1,245.66,106.41Z" />
      <path d="M32,96V64a8,8,0,0,1,8-8H92.69a8,8,0,0,1,5.65,2.34L115.31,75.31a8,8,0,0,0,5.66,2.34H208a8,8,0,0,1,8,8V96" />
    </>
  ),
  hardDrive: (color) => (
    <>
      <rect x="24" y="104" width="208" height="56" rx="8" />
      <line x1="72" y1="80" x2="72" y2="104" />
      <line x1="184" y1="80" x2="184" y2="104" />
      <circle cx="84" cy="132" r="8" fill={color} stroke="none" />
      <line x1="116" y1="132" x2="196" y2="132" strokeLinecap="round" />
    </>
  ),
  search: () => (
    <>
      <circle cx="112" cy="112" r="72" />
      <line x1="163.1" y1="163.1" x2="208" y2="208" strokeLinecap="round" />
    </>
  ),
  plus: () => (
    <>
      <line x1="40" y1="128" x2="216" y2="128" strokeLinecap="round" />
      <line x1="128" y1="40" x2="128" y2="216" strokeLinecap="round" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="128" cy="128" r="32" />
      <path d="M128,80V48M128,208v-32M176,128h32M48,128h32M162,94l22-22M72,184l22-22M162,162l22,22M72,72l22,22" strokeLinecap="round" />
    </>
  ),
  scan: () => (
    <>
      <rect x="40" y="40" width="176" height="176" rx="8" />
      <line x1="40" y1="128" x2="216" y2="128" strokeLinecap="round" />
    </>
  ),
  check: () => <polyline points="40 144 96 200 224 72" strokeLinecap="round" strokeLinejoin="round" />,
  close: () => (
    <>
      <line x1="200" y1="56" x2="56" y2="200" strokeLinecap="round" />
      <line x1="200" y1="200" x2="56" y2="56" strokeLinecap="round" />
    </>
  ),
  arrowRight: () => (
    <>
      <line x1="40" y1="128" x2="216" y2="128" strokeLinecap="round" />
      <polyline points="144 56 216 128 144 200" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  arrowLeft: () => (
    <>
      <line x1="216" y1="128" x2="40" y2="128" strokeLinecap="round" />
      <polyline points="112 56 40 128 112 200" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  arrowUpRight: () => (
    <>
      <line x1="64" y1="192" x2="192" y2="64" strokeLinecap="round" />
      <polyline points="88 64 192 64 192 168" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  chevron: () => <polyline points="96 48 176 128 96 208" strokeLinecap="round" strokeLinejoin="round" />,
  chevronDown: () => <polyline points="208 96 128 176 48 96" strokeLinecap="round" strokeLinejoin="round" />,
  chevronUp: () => <polyline points="208 160 128 80 48 160" strokeLinecap="round" strokeLinejoin="round" />,
  photo: () => (
    <>
      <rect x="32" y="48" width="192" height="160" rx="8" />
      <circle cx="88" cy="108" r="16" />
      <path d="m32 168 44-44a8,8,0,0,1,11.31,0l52.69,52.69" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m152 152 20-20a8,8,0,0,1,11.31,0L224 172.69" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  warning: (color) => (
    <>
      <path
        d="M142.41,40.22l87.46,151.64C236,202.33,228.73,216,216.54,216H39.46c-12.19,0-19.44-13.67-13.33-24.14L113.59,40.22C119.69,29.73,136.31,29.73,142.41,40.22Z"
        strokeLinejoin="round"
      />
      <line x1="128" y1="104" x2="128" y2="144" strokeLinecap="round" />
      <circle cx="128" cy="180" r="8" fill={color} stroke="none" />
    </>
  ),
  duplicate: () => (
    <>
      <rect x="40" y="72" width="144" height="144" rx="8" />
      <polyline points="72 40 216 40 216 184" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  missing: () => (
    <>
      <circle cx="128" cy="128" r="96" />
      <line x1="160" y1="96" x2="96" y2="160" strokeLinecap="round" />
      <line x1="160" y1="160" x2="96" y2="96" strokeLinecap="round" />
    </>
  ),
  command: () => (
    <path
      d="M160,96V64a24,24,0,1,1,24,24H160Zm0,0v64m0-64H96m64,64H72a24,24,0,1,0,24,24V160Zm0,0V96m0,64h64a24,24,0,1,1-24,24V160ZM96,96V72A24,24,0,1,0,72,96H96Zm0,0v64"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  dot: (color) => <circle cx="128" cy="128" r="24" fill={color} stroke="none" />,
  sparkle: () => (
    <path
      d="M197.58,129.06l-51.61-19-19-51.65a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0l19-51.61,51.65-19a15.92,15.92,0,0,0,0-29.88Z"
      strokeLinejoin="round"
    />
  ),
  clock: () => (
    <>
      <circle cx="128" cy="128" r="96" />
      <polyline points="128 72 128 128 184 128" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  info: (color) => (
    <>
      <circle cx="128" cy="128" r="96" />
      <polyline points="120 120 128 120 128 176 136 176" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="126" cy="84" r="10" fill={color} stroke="none" />
    </>
  ),
  refresh: () => (
    <>
      <polyline points="176 104 224 104 224 56" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="80 152 32 152 32 200" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M191.88,111.88A80,80,0,0,0,49.22,90.62L32,104" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M64.12,144.12a80,80,0,0,0,142.66,21.26L224,152" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  trash: () => (
    <>
      <line x1="216" y1="56" x2="40" y2="56" strokeLinecap="round" />
      <line x1="104" y1="104" x2="104" y2="168" strokeLinecap="round" />
      <line x1="152" y1="104" x2="152" y2="168" strokeLinecap="round" />
      <path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56" strokeLinejoin="round" />
      <path d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56" strokeLinejoin="round" />
    </>
  ),
  edit: () => (
    <>
      <path
        d="M92.69,216H48a8,8,0,0,1-8-8V163.31a8,8,0,0,1,2.34-5.65L139.31,60.69a8,8,0,0,1,11.32,0l44.68,44.68a8,8,0,0,1,0,11.32L98.34,213.66A8,8,0,0,1,92.69,216Z"
        strokeLinejoin="round"
      />
      <line x1="136" y1="64" x2="192" y2="120" strokeLinecap="round" />
    </>
  ),
  move: () => (
    <>
      <polyline points="96 40 128 8 160 40" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="216 96 248 128 216 160" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="160 216 128 248 96 216" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="40 160 8 128 40 96" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="128" y1="8" x2="128" y2="248" strokeLinecap="round" />
      <line x1="8" y1="128" x2="248" y2="128" strokeLinecap="round" />
    </>
  ),
  eye: () => (
    <>
      <path d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="128" cy="128" r="40" />
    </>
  ),
  sidebar: () => (
    <>
      <rect x="32" y="48" width="192" height="160" rx="8" />
      <line x1="88" y1="48" x2="88" y2="208" />
    </>
  ),
  filter: () => (
    <polygon points="40 56 216 56 160 128 160 192 96 216 96 128 40 56" strokeLinecap="round" strokeLinejoin="round" />
  ),
  sort: () => (
    <>
      <line x1="48" y1="128" x2="208" y2="128" strokeLinecap="round" />
      <line x1="48" y1="64" x2="208" y2="64" strokeLinecap="round" />
      <line x1="48" y1="192" x2="144" y2="192" strokeLinecap="round" />
    </>
  ),
  more: (color) => (
    <>
      <circle cx="128" cy="128" r="12" fill={color} stroke="none" />
      <circle cx="64" cy="128" r="12" fill={color} stroke="none" />
      <circle cx="192" cy="128" r="12" fill={color} stroke="none" />
    </>
  ),
  download: () => (
    <>
      <line x1="128" y1="144" x2="128" y2="32" strokeLinecap="round" />
      <polyline points="216 144 216 208 40 208 40 144" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="168 104 128 144 88 104" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  upload: () => (
    <>
      <line x1="128" y1="144" x2="128" y2="32" strokeLinecap="round" />
      <polyline points="216 144 216 208 40 208 40 144" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="88 72 128 32 168 72" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  link: () => (
    <>
      <line x1="95.51" y1="160.49" x2="160.49" y2="95.51" strokeLinecap="round" />
      <path d="M144,64l6.34-6.34a40,40,0,0,1,56.57,56.57L184,137.14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M112,192l-6.34,6.34a40,40,0,0,1-56.57-56.57L72,118.86" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  tag: (color) => (
    <>
      <path
        d="M128.35,32H48a16,16,0,0,0-16,16v80.34a8,8,0,0,0,2.34,5.66l120,120a8,8,0,0,0,11.32,0l80-80a8,8,0,0,0,0-11.32L134,34.34A8,8,0,0,0,128.35,32Z"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="84" r="12" fill={color} stroke="none" />
    </>
  ),
  user: () => (
    <>
      <circle cx="128" cy="96" r="64" />
      <path d="M32,216a112,112,0,0,1,192,0" strokeLinecap="round" />
    </>
  ),
  home: () => (
    <>
      <path d="M32,108l96-84,96,84V208a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8Z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="96 216 96 152 160 152 160 216" strokeLinejoin="round" />
    </>
  )
};
