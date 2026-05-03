import Fuse, { type FuseOptionKey } from "fuse.js";
import { useMemo } from "react";
import type { Drive, Project } from "@drive-project-catalog/domain";

export const MIN_QUERY_LENGTH = 2;
const MAX_PROJECT_RESULTS = 8;
const MAX_DRIVE_RESULTS = 5;

const PROJECT_FUSE_KEYS: FuseOptionKey<Project>[] = [
  { name: "correctedProject", weight: 2 },
  { name: "parsedProject", weight: 2 },
  { name: "correctedClient", weight: 1.5 },
  { name: "parsedClient", weight: 1.5 },
  { name: "folderName", weight: 1 },
  { name: "category", weight: 0.5 },
  { name: "folderPath", weight: 0.3 }
];

const DRIVE_FUSE_KEYS: FuseOptionKey<Drive>[] = [
  { name: "displayName", weight: 2 },
  { name: "volumeName", weight: 1 }
];

export interface CommandPaletteSearchResult {
  projectResults: Project[];
  driveResults: Drive[];
}

export function useCommandPaletteSearch(
  projects: Project[],
  drives: Drive[],
  query: string
): CommandPaletteSearchResult {
  const projectFuse = useMemo(
    () =>
      new Fuse(projects, {
        keys: PROJECT_FUSE_KEYS,
        threshold: 0.5,
        minMatchCharLength: MIN_QUERY_LENGTH,
        includeScore: true
      }),
    [projects]
  );

  const driveFuse = useMemo(
    () =>
      new Fuse(drives, {
        keys: DRIVE_FUSE_KEYS,
        threshold: 0.5,
        minMatchCharLength: MIN_QUERY_LENGTH,
        includeScore: true
      }),
    [drives]
  );

  return useMemo(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      return { projectResults: [], driveResults: [] };
    }

    const projectResults = projectFuse
      .search(query)
      .slice(0, MAX_PROJECT_RESULTS)
      .map((r) => r.item);

    // Drive results populated in issue 03
    const driveResults = driveFuse
      .search(query)
      .slice(0, MAX_DRIVE_RESULTS)
      .map((r) => r.item);

    return { projectResults, driveResults };
  }, [query, projectFuse, driveFuse]);
}
