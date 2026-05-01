import type { CSSProperties } from "react";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { ArrowsOutCardinal } from "@phosphor-icons/react/ArrowsOutCardinal";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { Check } from "@phosphor-icons/react/Check";
import { Circle } from "@phosphor-icons/react/Circle";
import { Clock } from "@phosphor-icons/react/Clock";
import { Command } from "@phosphor-icons/react/Command";
import { Copy } from "@phosphor-icons/react/Copy";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { Eye } from "@phosphor-icons/react/Eye";
import { Folder } from "@phosphor-icons/react/Folder";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Funnel } from "@phosphor-icons/react/Funnel";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { HardDrive } from "@phosphor-icons/react/HardDrive";
import { House } from "@phosphor-icons/react/House";
import { Image } from "@phosphor-icons/react/Image";
import { Info } from "@phosphor-icons/react/Info";
import { Link } from "@phosphor-icons/react/Link";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Scan } from "@phosphor-icons/react/Scan";
import { SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { SortAscending } from "@phosphor-icons/react/SortAscending";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { Tag } from "@phosphor-icons/react/Tag";
import { Trash } from "@phosphor-icons/react/Trash";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { User } from "@phosphor-icons/react/User";
import { Warning } from "@phosphor-icons/react/Warning";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import type {
  Icon as PhosphorIconComponent,
  IconWeight
} from "@phosphor-icons/react/dist/lib/types";

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
  weight?: IconWeight;
  title?: string;
}

const ICONS: Record<IconName, PhosphorIconComponent> = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  check: Check,
  chevron: CaretRight,
  chevronDown: CaretDown,
  chevronUp: CaretUp,
  clock: Clock,
  close: X,
  command: Command,
  dot: Circle,
  download: DownloadSimple,
  duplicate: Copy,
  edit: PencilSimple,
  eye: Eye,
  filter: Funnel,
  folder: Folder,
  folderOpen: FolderOpen,
  hardDrive: HardDrive,
  home: House,
  info: Info,
  link: Link,
  missing: WarningCircle,
  more: DotsThree,
  move: ArrowsOutCardinal,
  photo: Image,
  plus: Plus,
  refresh: ArrowClockwise,
  scan: Scan,
  search: MagnifyingGlass,
  settings: GearSix,
  sidebar: SidebarSimple,
  sort: SortAscending,
  sparkle: Sparkle,
  tag: Tag,
  trash: Trash,
  upload: UploadSimple,
  user: User,
  warning: Warning
};

function weightFromStrokeWidth(strokeWidth: number): IconWeight {
  if (strokeWidth >= 24) return "bold";
  if (strokeWidth <= 12) return "light";
  return "regular";
}

export function Icon({
  name,
  size = 16,
  color = "currentColor",
  className,
  style,
  strokeWidth = 16,
  weight,
  title
}: IconProps) {
  const PhosphorIcon = ICONS[name];
  return (
    <PhosphorIcon
      size={size}
      color={color}
      weight={weight ?? weightFromStrokeWidth(strokeWidth)}
      className={className}
      style={{ flexShrink: 0, display: "inline-block", ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    />
  );
}
