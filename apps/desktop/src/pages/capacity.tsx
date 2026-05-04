// CapacityBar and CapacityLegend — split from pagePrimitives.tsx (CODE-V2-01)

interface CapacityBarProps {
  usedBytes: number | null;
  totalBytes: number | null;
  reservedBytes?: number;
  overcommitted?: boolean;
  /**
   * Visual weight. Defaults to "md" (canonical 6px). "lg" is 8px for
   * hero capacity visuals on drive detail views only.
   */
  height?: "sm" | "md" | "lg";
}

export function CapacityBar({
  usedBytes,
  totalBytes,
  reservedBytes = 0,
  overcommitted = false,
  height = "md"
}: CapacityBarProps) {
  const pct =
    totalBytes && usedBytes !== null && totalBytes > 0
      ? (usedBytes / totalBytes) * 100
      : null;
  const isUnknown = pct === null;
  const usedPctStr = !isUnknown ? `${Math.max(1, pct!)}%` : "0%";
  const reservedPctStr =
    totalBytes && reservedBytes > 0 ? `${(reservedBytes / totalBytes) * 100}%` : undefined;

  const level: "normal" | "warn" | "danger" =
    pct !== null && pct > 95 ? "danger" : pct !== null && pct >= 80 ? "warn" : "normal";
  const dataLevel = level === "normal" ? undefined : level;

  const heightClass = height === "lg" ? "cap-bar lg" : "cap-bar";

  return (
    <div
      className={heightClass}
      role="progressbar"
      aria-valuenow={pct !== null ? Math.round(pct) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={pct !== null ? `Storage ${Math.round(pct)}% used` : "Storage usage unknown"}
    >
      {!isUnknown && (
        <div
          className="cap-used capacity-bar-fill"
          data-level={dataLevel}
          style={{ width: usedPctStr }}
        >
          {reservedPctStr ? (
            <div
              className="cap-reserved"
              style={{
                right: 0,
                width: reservedPctStr,
                background: overcommitted ? "var(--danger)" : undefined
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function CapacityLegend({
  usedLabel,
  reservedLabel,
  freeLabel
}: {
  usedLabel: string;
  reservedLabel?: string;
  freeLabel: string;
}) {
  return (
    <div
      className="flex flex-wrap"
      style={{ gap: "4px 16px", fontSize: 12, color: "var(--ink-3)", marginTop: 12 }}
    >
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink)", display: "inline-block" }} />
        {usedLabel}
      </span>
      {reservedLabel ? (
        <span className="inline-flex items-center" style={{ gap: 6 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-3)", display: "inline-block" }}
          />
          {reservedLabel}
        </span>
      ) : null}
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-4)", display: "inline-block" }} />
        {freeLabel}
      </span>
    </div>
  );
}
