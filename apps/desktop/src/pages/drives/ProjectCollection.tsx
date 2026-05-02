import { Link } from "react-router-dom";
import type { Project } from "@drive-project-catalog/domain";
import { formatBytes, formatParsedDate, getProjectName, getProjectStatusBadges } from "../dashboardHelpers";
import { SectionCard, StatusBadge } from "../pagePrimitives";

interface ProjectCollectionProps {
  title: string;
  description: string;
  projects: Project[];
  accentLabel?: string;
}

export function ProjectCollection({ title, description, projects, accentLabel }: ProjectCollectionProps) {
  return (
    <SectionCard title={title} description={description}>
      {projects.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: "var(--ink-3)", margin: 0 }}>Nothing here yet.</p>
      ) : (
        <div className="flex flex-col gap-px">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="link-card flex items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 transition-colors hover:bg-[color:var(--surface-inset)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium" style={{ color: "var(--ink)", margin: 0 }}>
                  {getProjectName(project)}
                </p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-3)", margin: "2px 0 0" }}>
                  {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {accentLabel ? <StatusBadge label={accentLabel} /> : null}
                {getProjectStatusBadges(project).map((badge) => (
                  <StatusBadge key={badge} label={badge} />
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
