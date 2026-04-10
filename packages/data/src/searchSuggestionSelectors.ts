import { getDisplayProject, getProjectStatusState, type Category, type Drive, type Project } from "@drive-project-catalog/domain";
import { buildDriveNameMap, getDriveNameFromMap } from "./catalogSelectors";
import { UNASSIGNED_DRIVE_FILTER_VALUE } from "./projectListSelectors";

export type SearchSuggestionGroupKey = "clients" | "projects" | "drives";

export interface SearchSuggestion {
  key: string;
  kind: "client" | "project" | "drive";
  label: string;
  value: string;
  matchType: "prefix" | "contains";
}

export interface SearchSuggestionGroup {
  key: SearchSuggestionGroupKey;
  label: string;
  suggestions: SearchSuggestion[];
}

export interface SearchSuggestionFilters {
  category?: Category | "";
  currentDriveId?: string;
  targetDriveId?: string;
  showUnassigned?: boolean;
  showMissing?: boolean;
  showDuplicate?: boolean;
  showMovePending?: boolean;
}

const groupLabels: Record<SearchSuggestionGroupKey, string> = {
  clients: "Clients",
  projects: "Projects",
  drives: "Drives"
};

export function buildProjectSearchSuggestions(
  projects: Project[],
  drives: Drive[],
  query: string,
  filters: SearchSuggestionFilters
): SearchSuggestionGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const filteredProjects = applyNonSearchFilters(projects, filters);
  const driveNameMap = buildDriveNameMap(drives);
  const groupBuckets: Record<SearchSuggestionGroupKey, SearchSuggestion[]> = {
    clients: [],
    projects: [],
    drives: []
  };
  const seen = new Set<string>();

  for (const project of filteredProjects) {
    // Use only the actual client fields — do not fall back to folderName here.
    // getDisplayClient falls back to folderName for personal_folder entries, which
    // would incorrectly surface folder names (e.g. "Tutorials") as client suggestions.
    for (const label of uniqueLabels([project.correctedClient ?? project.parsedClient])) {
      const suggestion = toSuggestion("client", label, normalizedQuery);
      if (suggestion && remember(seen, suggestion)) {
        groupBuckets.clients.push(suggestion);
      }
    }

    for (const label of uniqueLabels([getDisplayProject(project), project.parsedProject, project.folderName])) {
      const suggestion = toSuggestion("project", label, normalizedQuery);
      if (suggestion && remember(seen, suggestion)) {
        groupBuckets.projects.push(suggestion);
      }
    }

    for (const label of uniqueLabels([
      getDriveNameFromMap(driveNameMap, project.currentDriveId),
      getDriveNameFromMap(driveNameMap, project.targetDriveId)
    ])) {
      const suggestion = toSuggestion("drive", label, normalizedQuery);
      if (suggestion && remember(seen, suggestion)) {
        groupBuckets.drives.push(suggestion);
      }
    }
  }

  return (Object.keys(groupBuckets) as SearchSuggestionGroupKey[])
    .map((key) => ({
      key,
      label: groupLabels[key],
      suggestions: rankSuggestions(groupBuckets[key]).slice(0, 5)
    }))
    .filter((group) => group.suggestions.length > 0);
}

function applyNonSearchFilters(projects: Project[], filters: SearchSuggestionFilters) {
  const hasStatusFilters =
    Boolean(filters.showUnassigned) ||
    Boolean(filters.showMissing) ||
    Boolean(filters.showDuplicate) ||
    Boolean(filters.showMovePending);

  return projects.filter((project) => {
    const status = getProjectStatusState(project);

    if (filters.category && project.category !== filters.category) {
      return false;
    }

    if (filters.currentDriveId) {
      if (filters.currentDriveId === UNASSIGNED_DRIVE_FILTER_VALUE) {
        if (project.currentDriveId !== null) {
          return false;
        }
      } else if (project.currentDriveId !== filters.currentDriveId) {
        return false;
      }
    }

    if (filters.targetDriveId && project.targetDriveId !== filters.targetDriveId) {
      return false;
    }

    if (hasStatusFilters) {
      const matchesStatus =
        (filters.showUnassigned && status.isUnassigned) ||
        (filters.showMissing && status.isMissing) ||
        (filters.showDuplicate && status.isDuplicate) ||
        (filters.showMovePending && status.isMovePending);

      if (!matchesStatus) {
        return false;
      }
    }

    return true;
  });
}

function toSuggestion(
  kind: SearchSuggestion["kind"],
  label: string | null | undefined,
  normalizedQuery: string
): SearchSuggestion | null {
  const value = label?.trim();
  if (!value) {
    return null;
  }

  const normalizedValue = value.toLowerCase();
  if (normalizedValue.startsWith(normalizedQuery)) {
    return {
      key: `${kind}:${normalizedValue}`,
      kind,
      label: value,
      value,
      matchType: "prefix"
    };
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return {
      key: `${kind}:${normalizedValue}`,
      kind,
      label: value,
      value,
      matchType: "contains"
    };
  }

  return null;
}

function rankSuggestions(suggestions: SearchSuggestion[]) {
  return [...suggestions].sort((left, right) => {
    if (left.matchType !== right.matchType) {
      return left.matchType === "prefix" ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}

function uniqueLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function remember(seen: Set<string>, suggestion: SearchSuggestion) {
  if (seen.has(suggestion.key)) {
    return false;
  }

  seen.add(suggestion.key);
  return true;
}
