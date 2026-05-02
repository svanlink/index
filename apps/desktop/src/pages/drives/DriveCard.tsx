import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@drive-project-catalog/ui";
import type { Drive, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { getDriveHealthLabel, type DriveHealthState } from "@drive-project-catalog/data";
import { useVolumeInfo } from "../../app/scanCommands";
import { formatBytes, formatDate } from "../dashboardHelpers";
import { StatusBadge } from "../pagePrimitives";
import { getDriveColor } from "../driveColor";

export function DriveCard({
  drive,
  projectCount,
  scanSession,
  health
}: {
  drive: Drive;
  projectCount: number;
  scanSession: ScanSessionSnapshot | null;
  health?: DriveHealthState;
}) {
  const navigate = useNavigate();
  const volumeInfo = useVolumeInfo(scanSession?.rootPath);
  const isScanning = scanSession?.status === "running";
  const scanFailed =
    scanSession?.status === "failed" || scanSession?.status === "interrupted";
  const driveColor = getDriveColor(drive.id);

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

  // Use --drive-color scoped to this card to colorize the capacity bar + dot
  const cardStyle = { "--drive-color": driveColor } as CSSProperties;

  const capacityFooter = hasCapacity
    ? `${formatBytes(effectiveUsedBytes!)} of ${formatBytes(effectiveTotalBytes!)}`
    : "Unknown capacity";

  const lastScan = scanSession?.finishedAt ?? drive.lastScannedAt;
  const lastScanLabel = isScanning
    ? "Scanning…"
    : lastScan
      ? formatDate(lastScan)
      : "Never";

  return (
    <article
      className="card cursor-pointer p-5 transition-all duration-150 hover:shadow-[var(--sh-2)]"
      style={{
        ...cardStyle,
        backdropFilter: "blur(12px) saturate(160%)",
        WebkitBackdropFilter: "blur(12px) saturate(160%)",
        background: "rgba(255,255,255,0.82)"
      }}
      onClick={() => navigate(`/drives/${drive.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/drives/${drive.id}`);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${drive.displayName}`}
    >
      <div className="flex items-start gap-3">
        {/* 40×40 icon tile with drive-color dot overlay */}
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "var(--surface-inset)" }}
        >
          <Icon name="hardDrive" size={20} color="var(--ink-2)" />
          <span
            className="absolute"
            style={{
              bottom: 6,
              right: 6,
              width: 7,
              height: 7,
              borderRadius: 4,
              background: "var(--drive-color)",
              border: "1.5px solid var(--surface)"
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="truncate text-[15px] font-semibold"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.005em", color: "var(--ink)" }}
            >
            {drive.displayName}
            </h3>
            {health && health !== "healthy" ? (
              <StatusBadge label={getDriveHealthLabel(health)} />
            ) : null}
            {isScanning ? <StatusBadge label="Running" /> : null}
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
      </div>

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

      <div className="mt-2.5 flex items-center gap-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span className="tnum font-medium" style={{ color: "var(--ink-2)" }}>
          {usedPercentInt !== null ? `${usedPercentInt}% used` : "Unknown"}
        </span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span>{capacityFooter}</span>
      </div>

      {/* Meta row — inline, hairline-separated, no beige tiles. */}
      <div
        className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-[12px] tnum"
        style={{ borderColor: "var(--hairline)", color: "var(--ink-3)" }}
      >
        <span>
          <span className="font-medium" style={{ color: "var(--ink-2)" }}>{projectCount}</span>{" "}
          {projectCount === 1 ? "project" : "projects"}
        </span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span>
          {effectiveFreeBytes !== null ? `${formatBytes(effectiveFreeBytes)} free` : "Unknown free"}
        </span>
        {drive.reservedIncomingBytes > 0 ? (
          <>
            <span style={{ color: "var(--ink-4)" }}>·</span>
            <span>{formatBytes(drive.reservedIncomingBytes)} reserved</span>
          </>
        ) : null}
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span>Last scan {lastScanLabel}</span>
      </div>
    </article>
  );
}
