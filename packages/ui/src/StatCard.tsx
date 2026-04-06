import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  accent?: ReactNode;
}

export function StatCard({ label, value, detail, accent }: StatCardProps) {
  return (
    <article className="app-panel px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-text-soft)" }}>{label}</p>
          </div>
          <p className="mt-3 text-[30px] font-semibold leading-none" style={{ color: "var(--color-text)" }}>{value}</p>
          {detail ? <p className="mt-3 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>{detail}</p> : null}
        </div>
        {accent}
      </div>
    </article>
  );
}
