import { PageHeader } from "@drive-project-catalog/ui";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Placeholder only"
        description="Settings is intentionally light in Phase 1. This keeps navigation aligned with the product docs while sync, persistence, and scan configuration arrive in later phases."
      />

      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-sm leading-7 text-slate-600">
        Future settings will cover local storage, sync readiness, and scan preferences. This page currently exists to complete the desktop shell and keep the route structure stable.
      </div>
    </div>
  );
}

