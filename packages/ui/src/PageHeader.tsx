import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em]" style={{ color: "var(--color-text-soft)" }}>{eyebrow}</p>
        <h3 className="mt-2 text-[34px] font-semibold leading-[1.02]" style={{ color: "var(--color-text)" }}>{title}</h3>
        <p className="mt-4 max-w-3xl text-[15px] leading-7" style={{ color: "var(--color-text-muted)" }}>{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
