import { getScanStatusLabel, getScanStatusMessage } from "@drive-project-catalog/data";
import type { useScanWorkflow } from "../../app/scanWorkflow";
import { formatDate } from "../dashboardHelpers";

// Re-use MetaField inline — simple label/value pair
function MetaField({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
      <dt
        style={{ fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        {label}
      </dt>
      <dd
        className="tnum truncate"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: tone === "warn" ? "var(--warn)" : "var(--ink)",
          margin: 0
        }}
      >
        {value}
      </dd>
    </div>
  );
}

export interface ScanStatusPanelProps {
  scanSummary: NonNullable<ReturnType<typeof useScanWorkflow>["activeSession"]>;
  isRunning: boolean;
}

/**
 * Scan status panel — replaces the old 6-8 tile MetricCard grid with a
 * compact status line + inline meta row. Reads as a single paragraph of
 * state rather than a dashboard.
 */
export function ScanStatusPanel({ scanSummary, isRunning }: ScanStatusPanelProps) {
  const statusTone =
    scanSummary.status === "failed" || scanSummary.status === "interrupted"
      ? "danger"
      : scanSummary.status === "cancelled"
        ? "warn"
        : isRunning
          ? "accent"
          : "neutral";

  return (
    <div
      style={{ borderRadius: 12, padding: "14px 16px", background: "var(--surface-inset)" }}
    >
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        {isRunning ? (
          <span className="relative flex shrink-0 items-center justify-center" style={{ height: 16, width: 16 }} aria-hidden="true">
            <span className="pulse-ring absolute inline-flex rounded-full" style={{ height: 16, width: 16, background: "var(--action)", opacity: 0.4 }} />
            <span className="pulse-ring pulse-ring-2 absolute inline-flex rounded-full" style={{ height: 16, width: 16, background: "var(--action)", opacity: 0.4 }} />
            <span className="relative inline-flex rounded-full" style={{ height: 8, width: 8, background: "var(--action)" }} />
          </span>
        ) : (
          <span
            style={{
              display: "inline-block",
              height: 8,
              width: 8,
              borderRadius: "50%",
              background:
                statusTone === "danger"
                  ? "var(--danger)"
                  : statusTone === "warn"
                    ? "var(--warn)"
                    : statusTone === "neutral"
                      ? "var(--ink-3)"
                      : "var(--ok)"
            }}
            aria-hidden="true"
          />
        )}
        <span className="font-semibold" style={{ fontSize: 13, color: "var(--ink)" }}>
          {isRunning ? "Running" : "Last scan"}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {getScanStatusLabel(scanSummary)}
        </span>
      </div>
      <p
        className="mono"
        style={{ fontSize: 12, wordBreak: "break-all", margin: "6px 0 0", color: "var(--ink-3)" }}
      >
        {scanSummary.rootPath}
      </p>

      <dl
        className="scan-meta-grid"
        style={{ marginTop: 12, color: "var(--ink-3)" }}
      >
        <MetaField label="Folders" value={String(scanSummary.foldersScanned)} />
        <MetaField label="Matches" value={String(scanSummary.matchesFound)} />
        {scanSummary.summary ? (
          <>
            <MetaField label="New" value={String(scanSummary.summary.newProjectsCount)} />
            <MetaField label="Updated" value={String(scanSummary.summary.updatedProjectsCount)} />
            <MetaField label="Missing" value={String(scanSummary.summary.missingProjectsCount)} />
            <MetaField label="Duplicates" value={String(scanSummary.summary.duplicatesFlaggedCount)} />
          </>
        ) : null}
        <MetaField label="Started" value={formatDate(scanSummary.startedAt)} />
        <MetaField label="Ended" value={formatDate(scanSummary.finishedAt)} />
      </dl>

      {(scanSummary.status === "failed" ||
        scanSummary.status === "interrupted" ||
        scanSummary.status === "cancelled") ? (
        <p
          style={{
            fontSize: 12,
            margin: "12px 0 0",
            color: scanSummary.status === "cancelled" ? "var(--warn)" : "var(--danger)"
          }}
        >
          {getScanStatusMessage(scanSummary)}
        </p>
      ) : null}
    </div>
  );
}
