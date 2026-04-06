import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate } from "./dashboardHelpers";
import { CapacityLegend, EmptyState, LoadingState, SectionCard } from "./pagePrimitives";

interface DriveFormState {
  volumeName: string;
  displayName: string;
  capacityTerabytes: string;
}

const initialDriveForm: DriveFormState = {
  volumeName: "",
  displayName: "",
  capacityTerabytes: ""
};

export function DrivesPage() {
  const navigate = useNavigate();
  const { drives, projects, isLoading, isMutating, createDrive } = useCatalogStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [driveForm, setDriveForm] = useState<DriveFormState>(initialDriveForm);

  const projectCounts = useMemo(() => {
    return projects.reduce<Record<string, number>>((accumulator, project) => {
      if (project.currentDriveId) {
        accumulator[project.currentDriveId] = (accumulator[project.currentDriveId] ?? 0) + 1;
      }
      return accumulator;
    }, {});
  }, [projects]);

  async function handleCreateDrive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const drive = await createDrive({
      volumeName: driveForm.volumeName.trim(),
      displayName: driveForm.displayName.trim() || null,
      totalCapacityBytes: driveForm.capacityTerabytes
        ? Math.round(Number(driveForm.capacityTerabytes) * 1_000_000_000_000)
        : null
    });

    setDriveForm(initialDriveForm);
    setIsCreateOpen(false);
    navigate(`/drives/${drive.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Drives"
        title="Drives overview"
        description="Work with real local drive records, create new manual drives, and open a drive detail view for current, incoming, and missing project context."
        actions={
          <button
            type="button"
            className="button-secondary"
            onClick={() => setIsCreateOpen((current) => !current)}
          >
            {isCreateOpen ? "Close form" : "Create drive"}
          </button>
        }
      />

      {isCreateOpen ? (
        <SectionCard title="Create manual drive" description="Manual drives can exist before the physical drive is connected or scanned.">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreateDrive}>
            <FormField label="Drive name">
              <input
                required
                value={driveForm.volumeName}
                onChange={(event) => setDriveForm((current) => ({ ...current, volumeName: event.target.value }))}
                className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                placeholder="Archive Drive"
              />
            </FormField>
            <FormField label="Display name (optional)">
              <input
                value={driveForm.displayName}
                onChange={(event) => setDriveForm((current) => ({ ...current, displayName: event.target.value }))}
                className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                placeholder="Studio Archive"
              />
            </FormField>
            <FormField label="Capacity (TB, optional)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={driveForm.capacityTerabytes}
                onChange={(event) => setDriveForm((current) => ({ ...current, capacityTerabytes: event.target.value }))}
                className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                placeholder="4"
              />
            </FormField>
            <div className="md:col-span-2 xl:col-span-3 flex items-center justify-end gap-3">
              <button type="button" className="button-secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="button-success" disabled={isMutating}>
                {isMutating ? "Saving..." : "Create drive"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Drive cards" description="Capacity, reservation, and project counts across the current local drive catalog.">
        {isLoading ? (
          <LoadingState label="Loading drives" />
        ) : drives.length === 0 ? (
          <EmptyState title="No drives found" description="Create a manual drive to start planning storage." />
        ) : (
          <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {drives.map((drive) => (
              <article key={drive.id} className="rounded-[24px] border p-6" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-text-soft)" }}>Drive</p>
                    <h4 className="mt-2 text-[26px] font-semibold leading-none" style={{ color: "var(--color-text)" }}>{drive.displayName}</h4>
                    <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {drive.lastScannedAt ? `Last scanned ${formatDate(drive.lastScannedAt)}` : "Manual drive, not yet scanned"}
                    </p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>
                    {drive.createdManually ? "Manual" : "Scanned"}
                  </span>
                </div>

                <div className="mt-6 overflow-hidden rounded-full" style={{ background: "#e5dfd5" }}>
                  <div
                    className="relative h-2.5 rounded-full"
                    style={{
                      width:
                        drive.totalCapacityBytes && drive.usedBytes !== null
                          ? `${Math.max(8, (drive.usedBytes / drive.totalCapacityBytes) * 100)}%`
                          : "30%",
                      background: "var(--color-accent)"
                    }}
                  >
                    {drive.totalCapacityBytes && drive.reservedIncomingBytes > 0 ? (
                      <div
                        className="absolute right-0 top-0 h-full rounded-full"
                        style={{
                          width: `${Math.max(6, (drive.reservedIncomingBytes / drive.totalCapacityBytes) * 100)}%`,
                          background: "#b18f63"
                        }}
                      />
                    ) : null}
                  </div>
                </div>
                <CapacityLegend
                  usedLabel="Used"
                  reservedLabel={drive.reservedIncomingBytes > 0 ? "Reserved" : undefined}
                  freeLabel="Free"
                />

                <div className="mt-5 space-y-3">
                  <DriveMetric label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
                  <DriveMetric label="Used" value={formatBytes(drive.usedBytes)} />
                  <DriveMetric label="Free" value={formatBytes(drive.freeBytes)} />
                  <DriveMetric label="Reserved incoming" value={formatBytes(drive.reservedIncomingBytes)} />
                  <DriveMetric label="Projects" value={String(projectCounts[drive.id] ?? 0)} />
                </div>

                <div className="mt-5 flex gap-3">
                  <Link to={`/drives/${drive.id}`} className="button-secondary flex-1 text-center">
                    Open detail
                  </Link>
                  <Link
                    to={`/projects?drive=${drive.id}`}
                    className="button-secondary flex-1 text-center"
                  >
                    View projects
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </SectionCard>
    </div>
  );
}

function DriveMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border bg-white px-4 py-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
      <span style={{ color: "var(--color-text-soft)" }}>{label}</span>
      <span className="font-medium" style={{ color: "var(--color-text)" }}>{value}</span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
