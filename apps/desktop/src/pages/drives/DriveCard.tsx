import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@drive-project-catalog/ui";
import type { Drive, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { getDriveHealthLabel, type DriveHealthState } from "@drive-project-catalog/data";
import { useVolumeInfo } from "../../app/scanCommands";
import { formatBytes, formatDate } from "../dashboardHelpers";
import { CapacityLegend, StatusBadge } from "../pagePrimitives";
import { getDriveColor } from "../driveColor";

export function DriveCard({
  drive,
  projectCount,
  scanSession,
  health,
  onScan,
  onImport
}: {
  drive: Drive;
  projectCount: number;
  scanSession: ScanSessionSnapshot | null;
  health?: DriveHealthState;
  onScan?: () => void;
  onImport?: () => void;
}) {
  const navigate = useNavigate();
  const volumeInfo = useVolumeInfo(scanSession?.rootPath);
  const isScanning = scanSession?.status === "running";
  const scanFailed =
    scanSession?.status === "failed" || scanSession?.status === "interrupted";
  const driveColor = getDriveColor(drive.id);

  // Connection state derived from live volume info + scan session status
  const connectionLabel: string = isScanning ? "Mounting" : volumeInfo ? "Online" : "Offline";

  // Prefer stored drive values; fall back to live OS volume info when null.
  const effectiveTotalBytes = drive.totalCapacityBytes ?? volumeInfo?.totalBytes ?? null;
  const effectiveFreeBytes = drive.freeBytes ?? volumeInfo?.freeBytes ?? null;
  const effectiveUsedBytes =
    drive.usedBytes ??
    (effectiveTotalBytes !== null && volumeInfo?.freeBytes !== undefined
      ? effectiveTotalBytes - volumeInfo.freeBytes
      : null);

  const hasCapacity = effectiveTotalBytes !== null && effectiveUsedBytes !== null;
  const usedPercent = hasCapacity
    ? Math.min(100, Math.max(2, (effectiveUsedBytes! / effectiveTotalBytes!) * 100))
    : null;
  const usedPercentInt = hasCapacity
    ? Math.round((effectiveUsedBytes! / effectiveTotalBytes!) * 100)
    : null;
  const reservedPercent =
    hasCapacity && drive.reservedIncomingBytes > 0
      ? Math.min(100 - (usedPercent ?? 0), Math.max(1, (drive.reservedIncomingBytes / effectiveTotalBytes!) * 100))
      : null;

  // --drive-color scoped to this card for the capacity bar fill and left border accent
  const cardStyle = { "--drive-color": driveColor } as CSSProperties;

  const lastScan = scanSession?.finishedAt ?? drive.lastScannedAt;
  const lastScanLabel = isScanning
    ? "Scanning…"
    : lastScan
      ? formatDate(lastScan)
      : "Never";

  const hasHoverActions = Boolean(onScan || onImport);

  return (
    <article
      className="card group overflow-hidden transition-all duration-150 hover:shadow-[var(--sh-2)]"
      style={{
        ...cardStyle,
        // A1: 3px left accent border replaces the old 7px dot overlay
        borderLeft: "3px solid var(--drive-color)",
        backdropFilter: "blur(12px) saturate(160%)",
        WebkitBackdropFilter: "blur(12px) saturate(160%)",
        background: "rgba(255,255,255,0.82)"
      }}
    >
      {/* Clickable header — navigates to drive detail */}
      <button
        type="button"
        className="flex w-full items-start gap-3 px-5 pt-5 pb-0 text-left"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
        onClick={() => navigate(`/drives/${drive.id}`)}
        aria-label={`Open ${drive.displayName}`}
      >
        {/* 40×40 icon tile — dot removed; accent now lives on the card left border */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "var(--surface-inset)" }}
        >
          <Icon name="hardDrive" size={20} color="var(--ink-2)" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="truncate text-[15px] font-semibold"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.005em", color: "var(--ink)" }}
            >
              {drive.displayName}
            </h3>
            {/* A2: Connection state chip — Online / Offline / Mounting */}
            <StatusBadge label={connectionLabel} />
            {health && health !== "healthy" ? (
              <StatusBadge label={getDriveHealthLabel(health)} />
            ) : null}
            {scanFailed && !isScanning ? <StatusBadge label="Failed" /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            {drive.volumeName !== drive.displayName ? <span>{drive.volumeName}</span> : null}
            {drive.volumeName !== drive.displayName && (drive.createdManually || volumeInfo) ? (
              <span style={{ color: "var(--ink-4)" }}>·</span>
            ) : null}
            {drive.createdManually ? <span>Manual</span> : null}
            {!drive.createdManually && volumeInfo?.filesystemType ? <span>{volumeInfo.filesystemType}</span> : null}
          </div>
        </div>

        <Icon name="chevron" size={14} color="var(--ink-4)" />
      </button>

      {/* Non-interactive card body */}
      <div className="px-5 pb-5">
        {/* Capacity bar */}
        <div
          className="cap-bar lg mt-4"
          role="progressbar"
          aria-valuenow={usedPercentInt ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            usedPercentInt !== null ? `${usedPercentInt}% storage used` : "Storage usage unknown"
          }
        >
          {usedPercent !== null ? (
            <div className="cap-used capacity-bar-fill" style={{ width: `${usedPercent}%` }} />
          ) : null}
          {reservedPercent !== null ? (
            <div
              className="cap-reserved"
              style={{ left: `${usedPercent ?? 0}%`, width: `${reservedPercent}%` }}
            />
          ) : null}
        </div>

        {/* A4: Three-item capacity legend below the bar */}
        {hasCapacity ? (
          <CapacityLegend
            usedLabel={`${usedPercentInt}% used · ${formatBytes(effectiveUsedBytes!)}`}
            reservedLabel={
              drive.reservedIncomingBytes > 0
                ? `${formatBytes(drive.reservedIncomingBytes)} reserved`
                : undefined
            }
            freeLabel={
              effectiveFreeBytes !== null
                ? `${formatBytes(effectiveFreeBytes)} free`
                : "Unknown free"
            }
          />
        ) : (
          <p className="mt-2.5 text-[11px]" style={{ color: "var(--ink-4)" }}>
            Unknown capacity
          </p>
        )}

        {/* Meta row — project count, last scan, and A3: hover-reveal action buttons */}
        <div
          className="mt-3.5 flex items-center gap-3 border-t pt-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div
            className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tnum"
            style={{ color: "var(--ink-3)" }}
          >
            <span>
              <span className="font-medium" style={{ color: "var(--ink-2)" }}>{projectCount}</span>{" "}
              {projectCount === 1 ? "project" : "projects"}
            </span>
            <span style={{ color: "var(--ink-4)" }}>·</span>
            <span>Last scan {lastScanLabel}</span>
          </div>

          {/* A3: Hover-reveal actions — stopPropagation prevents card navigation */}
          {hasHoverActions ? (
            <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {onScan ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onScan();
                  }}
                >
                  <Icon name="scan" size={12} color="currentColor" />
                  Scan
                </button>
              ) : null}
              {onImport ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onImport();
                  }}
                >
                  <Icon name="download" size={12} color="currentColor" />
                  Import
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
