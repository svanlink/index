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
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>Nothing here yet.</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 1 }}>
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="link-card flex items-center justify-between"
              style={{ gap: 12, borderRadius: 8, padding: "8px 10px", transition: "background 140ms var(--ease)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" style={{ fontSize: 13, color: "var(--ink)", margin: 0 }}>
                  {getProjectName(project)}
                </p>
                <p style={{ marginTop: 2, fontSize: 12, color: "var(--ink-3)", margin: "2px 0 0" }}>
                  {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0" style={{ gap: 4 }}>
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
