import { Link, useParams } from "react-router-dom";
import { buildScanSessionDetailView, findCatalogProjectForScanRecord, getScanStatusLabel, getScanStatusMessage } from "@drive-project-catalog/data";
import { PageHeader } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate } from "./dashboardHelpers";
import { EmptyState, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";
import { formatScanDuration } from "./scanPageHelpers";

export function ScanDetailPage() {
  const { scanId = "" } = useParams();
  const { scanSessions, drives, projects, isLoading } = useCatalogStore();
  const session = scanSessions.find((entry) => entry.scanId === scanId) ?? null;
  const detail = buildScanSessionDetailView(scanSessions, drives, scanId);

  if (isLoading) {
    return <LoadingState label="Loading scan detail" />;
  }

  if (!detail) {
    return (
      <EmptyState
        title="Scan session not found"
        description="The requested scan session is not available in the current local catalog."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scan detail"
        title={detail.driveName}
        description="Review the persisted scan session lifecycle, timing, reconciliation summary, and observed project folders captured during the scan."
        actions={
          <Link to="/scans" className="button-secondary">
            Back to scans
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label={getScanStatusLabel(detail)} />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Session overview" description="Final state, timestamps, path mapping, and persisted scan counters from the desktop session.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Status" value={getScanStatusLabel(detail)} />
            <DetailField label="Drive mapping" value={detail.driveName} />
            <DetailField label="Started" value={formatDate(detail.startedAt)} />
            <DetailField label="Ended" value={formatDate(detail.finishedAt)} />
            <DetailField label="Duration" value={formatScanDuration(detail.durationMs)} />
            <DetailField label="Target path" value={detail.targetPath} />
            <DetailField label="Folders scanned" value={String(detail.foldersScanned)} />
            <DetailField label="Matches found" value={String(detail.matchesFound)} />
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Ingestion summary" description="Counts persisted after scan reconciliation into the local catalog.">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailField label="New projects" value={String(detail.newProjectsCount)} />
              <DetailField label="Updated projects" value={String(detail.updatedProjectsCount)} />
              <DetailField label="Missing projects" value={String(detail.missingProjectsCount)} />
              <DetailField label="Duplicates flagged" value={String(detail.duplicatesFlaggedCount)} />
            </div>
          </SectionCard>

          {(detail.status === "failed" || detail.status === "interrupted" || detail.status === "cancelled" || detail.summaryMessage) ? (
            <SectionCard title="Session message" description="Human-readable outcome recorded for the scan session.">
              <p className="text-sm leading-6" style={{ color: detail.status === "cancelled" ? "var(--color-warning)" : "var(--color-text-muted)" }}>
                {getScanStatusMessage({
                  status: detail.status,
                  error: detail.error,
                  summary: null,
                  finishedAt: detail.finishedAt,
                  startedAt: detail.startedAt
                })}
              </p>
            </SectionCard>
          ) : null}
        </div>
      </section>

      <SectionCard title="Observed projects" description="Folder observations already stored with the scan session and ready for future scan-history workflows.">
        {detail.projects.length === 0 ? (
          <EmptyState title="No project records captured" description="This session completed without project folder observations." />
        ) : (
          <div className="space-y-3">
            {detail.projects.map((project) => (
              <ObservedProjectCard
                key={project.id}
                project={project}
                catalogProjectId={session ? findCatalogProjectForScanRecord(project, session, projects, drives)?.id ?? null : null}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ObservedProjectCard({
  project,
  catalogProjectId
}: {
  project: NonNullable<ReturnType<typeof buildScanSessionDetailView>>["projects"][number];
  catalogProjectId: string | null;
}) {
  return (
    <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-medium" style={{ color: "var(--color-text)" }}>
            {project.parsedDate}_{project.parsedClient}_{project.parsedProject}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {project.folderPath}
          </p>
        </div>
        <StatusBadge label={project.sizeStatus === "failed" ? "Failed" : project.sizeStatus === "pending" ? "Pending size" : project.sizeStatus === "ready" ? "Size ready" : "Unknown size"} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <DetailField label="Observed at" value={formatDate(project.scanTimestamp)} />
        <DetailField label="Source drive" value={project.sourceDriveName} />
        <DetailField label="Relative path" value={project.relativePath} />
        <DetailField label="Size" value={formatBytes(project.sizeBytes)} />
      </div>
      <div className="mt-4">
        {catalogProjectId ? (
          <Link to={`/projects/${catalogProjectId}`} className="button-secondary">
            Open catalog project
          </Link>
        ) : (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No linked catalog project found for this observed folder.
          </p>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 break-words" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}
