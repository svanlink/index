// Empty states and skeleton loaders — split from pagePrimitives.tsx (CODE-V2-01)
import { type ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-xl)",
        padding: "24px 20px"
      }}
    >
      <p style={{ color: "var(--ink)", margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</p>
      <p style={{ color: "var(--ink-3)", margin: "4px 0 0", fontSize: 14, lineHeight: 1.5 }}>
        {description}
      </p>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="text-center" style={{ padding: "24px 0" }}>
      <p style={{ color: "var(--ink-3)", margin: 0, fontSize: 14 }}>{label}</p>
    </div>
  );
}

export function DriveCardSkeleton() {
  return (
    <div className="card flex flex-col" style={{ padding: 0 }} aria-hidden="true">
      <div style={{ padding: "16px 16px 12px" }}>
        <div className="skeleton" style={{ height: 14, width: "66%", borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 10, width: "33%", borderRadius: 4, marginTop: 8 }} />
        <div className="skeleton" style={{ height: 10, width: "50%", borderRadius: 4, marginTop: 8 }} />
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <div className="skeleton" style={{ height: 6, width: "100%", borderRadius: 9999 }} />
        <div className="flex" style={{ gap: 16, marginTop: 8 }}>
          <div className="skeleton" style={{ height: 8, width: 64, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 8, width: 64, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 8, width: 48, borderRadius: 4 }} />
        </div>
      </div>
      <div
        className="flex"
        style={{ gap: 12, borderTop: "1px solid var(--hairline)", padding: "10px 16px" }}
      >
        <div className="skeleton" style={{ height: 12, width: 32, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 12, width: 48, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function ProjectRowSkeleton() {
  return (
    <div
      className="flex items-center"
      style={{ gap: 12, borderBottom: "1px solid var(--hairline)", padding: "10px 12px" }}
      aria-hidden="true"
    >
      <div className="skeleton shrink-0" style={{ height: 14, width: 14, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 64, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 96, borderRadius: 4 }} />
      <div className="skeleton flex-1" style={{ height: 10, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 80, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 64, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 56, borderRadius: 4 }} />
    </div>
  );
}
