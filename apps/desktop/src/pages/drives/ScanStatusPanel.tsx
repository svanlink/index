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
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt
        className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-4)" }}
      >
        {label}
      </dt>
      <dd
        className="tnum truncate text-[13.5px] font-medium"
        style={{
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
      className="rounded-[12px] px-4 py-3.5"
      style={{ background: "var(--surface-inset)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background:
              statusTone === "danger"
                ? "var(--danger)"
                : statusTone === "warn"
                  ? "var(--warn)"
                  : statusTone === "accent"
                    ? "var(--accent)"
                    : "var(--ok)"
          }}
          aria-hidden="true"
        />
        <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          {isRunning ? "Running" : "Last scan"}
        </span>
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {getScanStatusLabel(scanSummary)}
        </span>
      </div>
      <p
        className="mono mt-1.5 text-[11.5px] break-all"
        style={{ color: "var(--ink-3)", margin: "6px 0 0" }}
      >
        {scanSummary.rootPath}
      </p>

      <dl
        className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4"
        style={{ color: "var(--ink-3)" }}
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
          className="mt-3 text-[12.5px]"
          style={{
            color: scanSummary.status === "cancelled" ? "var(--warn)" : "var(--danger)",
            margin: "12px 0 0"
          }}
        >
          {getScanStatusMessage(scanSummary)}
        </p>
      ) : null}
    </div>
  );
}
