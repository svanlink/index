import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Drive } from "@drive-project-catalog/domain";
import {
  getActiveScanSession,
  getLatestTerminalScanSession,
  getScanStatusLabel,
  getScanStatusMessage
} from "@drive-project-catalog/data";
import type { StatusAlert } from "@drive-project-catalog/data";
import { Icon, type IconName } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes } from "./dashboardHelpers";
import { formatElapsedSeconds } from "./scanPageHelpers";
import { getDriveColor } from "./driveColor";
import { EmptyState } from "./pagePrimitives";

// ---------------------------------------------------------------------------
// Inbox dashboard — Things-3 minimal. Only what needs attention.
// ---------------------------------------------------------------------------

type AttentionTone = "warn" | "danger" | "info" | "accent";

interface AttentionCard {
  id: string;
  label: string;
  sub: string;
  tone: AttentionTone;
  icon: IconName;
  to: string;
}

const TONE_STYLES: Record<AttentionTone, { bg: string; fg: string }> = {
  warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  info: { bg: "var(--info-soft)", fg: "var(--info)" },
  accent: { bg: "var(--accent-soft, var(--info-soft))", fg: "var(--accent, var(--info))" }
};

function formatInboxDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function countByKind(alerts: StatusAlert[], kind: StatusAlert["kind"]): number {
  return alerts.filter((alert) => alert.kind === kind).length;
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { dashboard, drives, isLoading, scanSessions } = useCatalogStore();
  const activeScan = getActiveScanSession(scanSessions);
  const latestTerminalScan = getLatestTerminalScanSession(scanSessions);

  // Live elapsed-time counter for the active scan banner — ticks every second.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!activeScan) {
      setElapsedSeconds(0);
      return;
    }
    const startMs = new Date(activeScan.startedAt).getTime();
    setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activeScan?.scanId, activeScan?.startedAt]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const unassignedCount = countByKind(dashboard.statusAlerts, "unassigned");
  const missingCount = countByKind(dashboard.statusAlerts, "missing");
  const duplicateCount = countByKind(dashboard.statusAlerts, "duplicate");
  const moveCount = dashboard.moveReminders.length;
  const totalAttention = unassignedCount + missingCount + duplicateCount + moveCount;

  const attention: AttentionCard[] = [];
  if (unassignedCount > 0) {
    attention.push({
      id: "unassigned",
      label: "Unassigned",
      sub: `${unassignedCount} ${pluralize(unassignedCount, "project")} not on any drive`,
      tone: "warn",
      icon: "folder",
      to: "/projects?unassigned=1"
    });
  }
  if (missingCount > 0) {
    attention.push({
      id: "missing",
      label: "Missing",
      sub: `${missingCount} ${pluralize(missingCount, "project")} not found on last scan`,
      tone: "danger",
      icon: "missing",
      to: "/projects?missing=1"
    });
  }
  if (duplicateCount > 0) {
    attention.push({
      id: "duplicates",
      label: "Duplicates",
      sub: `${duplicateCount} ${pluralize(duplicateCount, "project")} on multiple drives`,
      tone: "warn",
      icon: "duplicate",
      to: "/projects?duplicate=1"
    });
  }
  if (moveCount > 0) {
    attention.push({
      id: "moves",
      label: "Pending moves",
      sub: `${moveCount} ${pluralize(moveCount, "move")} staged`,
      tone: "info",
      icon: "move",
      to: "/projects?movePending=1"
    });
  }

  const showLatestScanOutcome =
    !activeScan &&
    latestTerminalScan &&
    latestTerminalScan.status !== "completed" &&
    latestTerminalScan.status !== "running";

  return (
    <div className="mx-auto max-w-[820px] px-10 pt-12 pb-16">
      {/* Header */}
      <header className="mb-10">
        <div className="eyebrow">{formatInboxDate(new Date())}</div>
        <h1 className="h-display" style={{ margin: "6px 0 0" }}>
          Inbox
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--ink-3)" }}>
          {totalAttention === 0
            ? "Everything is in order."
            : `${totalAttention} ${pluralize(totalAttention, "item")} ${totalAttention === 1 ? "needs" : "need"} your attention.`}
        </p>
      </header>

      {/* Active scan banner — real-time status */}
      {activeScan ? (
        <div
          className="card mb-10"
          style={{
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderColor: "var(--accent, var(--info))"
          }}
          role="status"
          aria-live="polite"
        >
          <span className="pulse-dot shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              Scanning {activeScan.driveName}
            </div>
            <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
              {activeScan.foldersScanned} folders · {activeScan.matchesFound} matches
              {elapsedSeconds > 0 ? ` · ${formatElapsedSeconds(elapsedSeconds)}` : ""}
            </div>
          </div>
          {activeScan.requestedDriveId ? (
            <Link to={`/drives/${activeScan.requestedDriveId}`} className="btn btn-sm">
              Open drive
            </Link>
          ) : (
            <Link to="/drives" className="btn btn-sm">
              Open drives
            </Link>
          )}
        </div>
      ) : null}

      {/* Attention cards */}
      {attention.length > 0 ? (
        <section className="mb-10">
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
          >
            {attention.map((card) => (
              <AttentionTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Latest scan outcome (failure / interruption) — only when no active scan */}
      {showLatestScanOutcome ? (
        <section className="mb-10">
          <SectionHeader title="Latest scan" />
          <div className="card" style={{ padding: "16px 18px" }}>
            <div className="flex items-center gap-3">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--warn-soft)" }}
              >
                <Icon name="warning" size={13} color="var(--warn)" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                  {getScanStatusLabel(latestTerminalScan)} — {latestTerminalScan.driveName}
                </div>
                <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {getScanStatusMessage(latestTerminalScan)}
                </div>
              </div>
              {latestTerminalScan.requestedDriveId ? (
                <Link to={`/drives/${latestTerminalScan.requestedDriveId}`} className="btn btn-sm">
                  Open drive
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* Recent scans */}
      <section className="mb-10">
        <SectionHeader
          title="Recent scans"
          action={
            <Link to="/drives" className="btn btn-ghost btn-sm">
              View all
            </Link>
          }
        />
        {dashboard.recentScans.length === 0 ? (
          <EmptyState
            title="No scans yet"
            description="Recent drive scans will appear here once the first one is recorded."
          />
        ) : (
          <div className="card overflow-hidden">
            {dashboard.recentScans.slice(0, 5).map((scan, index, arr) => (
              <RecentScanRow
                key={scan.id}
                driveId={scan.driveId}
                driveName={scan.driveName}
                projectCount={scan.projectCount}
                freeBytes={scan.freeBytes}
                totalCapacityBytes={scan.totalCapacityBytes}
                lastScannedAt={scan.lastScannedAt}
                isLast={index === arr.length - 1}
              />
            ))}
          </div>
        )}
      </section>

      {/* Capacity overview */}
      {drives.length > 0 ? (
        <section>
          <SectionHeader title="Capacity" />
          <div className="card" style={{ padding: "20px 22px" }}>
            {drives.map((drive, index) => (
              <CapacityRow
                key={drive.id}
                drive={drive}
                isFirst={index === 0}
                isLast={index === drives.length - 1}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader — h-section + optional trailing action
// ---------------------------------------------------------------------------

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-baseline">
      <div className="h-section">{title}</div>
      <div className="flex-1" />
      {action ?? null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttentionTile — inbox card linking to a filtered Projects view
// ---------------------------------------------------------------------------

function AttentionTile({ card }: { card: AttentionCard }) {
  const { bg, fg } = TONE_STYLES[card.tone];
  return (
    <Link
      to={card.to}
      className="attention-tile block"
      style={{
        padding: "18px 18px 16px",
        borderRadius: 10,
        background: "var(--surface, white)",
        border: "1px solid var(--hairline)",
        transition: "border-color 140ms var(--ease, ease)",
        textDecoration: "none",
        color: "inherit"
      }}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]"
          style={{ background: bg, color: fg }}
          aria-hidden="true"
        >
          <Icon name={card.icon} size={15} color="currentColor" />
        </div>
        <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
          {card.label}
        </div>
        <div className="flex-1" />
        <Icon name="chevron" size={13} color="var(--ink-4)" />
      </div>
      <div className="text-[13px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
        {card.sub}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// RecentScanRow — status tile + drive name + capacity summary + timestamp
// ---------------------------------------------------------------------------

interface RecentScanRowProps {
  driveId: string | null;
  driveName: string;
  projectCount: number;
  freeBytes: number | null;
  totalCapacityBytes: number | null;
  lastScannedAt: string | null;
  isLast: boolean;
}

function RecentScanRow({
  driveId,
  driveName,
  projectCount,
  freeBytes,
  totalCapacityBytes,
  lastScannedAt,
  isLast
}: RecentScanRowProps) {
  const ok = totalCapacityBytes !== null && freeBytes !== null;
  const summary = [
    `${projectCount} ${pluralize(projectCount, "project")}`,
    totalCapacityBytes !== null ? `${formatBytes(totalCapacityBytes)} total` : null,
    freeBytes !== null ? `${formatBytes(freeBytes)} free` : null
  ]
    .filter(Boolean)
    .join(" · ");

  const timeLabel = formatRelativeTime(lastScannedAt);

  return (
    <Link
      to={driveId ? `/drives/${driveId}` : "/drives"}
      className="flex items-center gap-3.5"
      style={{
        padding: "14px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--hairline)",
        color: "inherit",
        textDecoration: "none"
      }}
    >
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: ok ? "var(--ok-soft)" : "var(--warn-soft)" }}
        aria-hidden="true"
      >
        <Icon
          name={ok ? "check" : "warning"}
          size={13}
          color={ok ? "var(--ok)" : "var(--warn)"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
          {driveName}
        </div>
        <div className="mt-px truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {summary}
        </div>
      </div>
      <div className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "var(--ink-4)" }}>
        {timeLabel}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// CapacityRow — drive dot + name + fill bar + used/total + percent
// ---------------------------------------------------------------------------

function CapacityRow({
  drive,
  isFirst,
  isLast
}: {
  drive: Drive;
  isFirst: boolean;
  isLast: boolean;
}) {
  const usedBytes = drive.usedBytes ?? null;
  const totalBytes = drive.totalCapacityBytes ?? null;
  const pct =
    usedBytes !== null && totalBytes !== null && totalBytes > 0
      ? Math.round((usedBytes / totalBytes) * 100)
      : null;

  const driveColor = getDriveColor(drive.id);
  const style = { "--drive-color": driveColor } as CSSProperties;

  return (
    <div
      className="flex items-center gap-3.5"
      style={{
        paddingTop: isFirst ? 0 : 14,
        paddingBottom: isLast ? 0 : 14,
        borderTop: isFirst ? "none" : "1px solid var(--hairline)"
      }}
    >
      <span
        className="drive-dot shrink-0"
        style={{ ...style, width: 8, height: 8 }}
        aria-hidden="true"
      />
      <div
        className="shrink-0 truncate text-[13px] font-medium"
        style={{ width: 110, color: "var(--ink)" }}
      >
        {drive.displayName || drive.volumeName}
      </div>
      <div className="flex-1" style={{ maxWidth: 260 }}>
        <div className="cap-bar" style={style}>
          <div
            className="cap-used"
            style={{ ...style, width: pct !== null ? `${pct}%` : "0%" }}
          />
        </div>
      </div>
      <div
        className="shrink-0 text-right text-[12.5px] tabular-nums"
        style={{ width: 110, color: "var(--ink-3)" }}
      >
        {usedBytes !== null && totalBytes !== null
          ? `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`
          : "—"}
      </div>
      <div
        className="shrink-0 text-right text-[12.5px] font-medium tabular-nums"
        style={{ width: 40, color: "var(--ink-2)" }}
      >
        {pct !== null ? `${pct}%` : "—"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardSkeleton — quiet loading state matching the inbox cadence
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div
      className="mx-auto max-w-[820px] px-10 pt-12 pb-16"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="mb-10">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="skeleton mt-3 h-8 w-32 rounded" />
        <div className="skeleton mt-3 h-3.5 w-48 rounded" />
      </div>
      <div className="mb-10 grid gap-2.5" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[10px] border"
            style={{ borderColor: "var(--hairline)", padding: "18px" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="skeleton h-7 w-7 rounded-[7px]" />
              <div className="skeleton h-3.5 w-20 rounded" />
            </div>
            <div className="skeleton mt-3 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
      <div className="mb-4 skeleton h-4 w-28 rounded" />
      <div className="card overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3.5"
            style={{
              padding: "14px 18px",
              borderBottom: i === 2 ? "none" : "1px solid var(--hairline)"
            }}
          >
            <div className="skeleton h-6 w-6 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton mt-1.5 h-2.5 w-48 rounded" />
            </div>
            <div className="skeleton h-3 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relative time formatter — compact, tabular-friendly
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
