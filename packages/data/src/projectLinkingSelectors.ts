import type { Drive, Project, ScanProjectRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { getMappedDriveId } from "./scanHistorySelectors";

export function findCatalogProjectForScanRecord(
  record: ScanProjectRecord,
  session: ScanSessionSnapshot,
  projects: Project[],
  drives: Drive[]
) {
  const mappedDriveId = getMappedDriveId(session, drives);
  const exactMatches = projects.filter((project) =>
    project.parsedDate === record.parsedDate &&
    project.parsedClient === record.parsedClient &&
    project.parsedProject === record.parsedProject
  );

  if (exactMatches.length === 0) {
    return null;
  }

  if (mappedDriveId) {
    return exactMatches.find((project) => project.currentDriveId === mappedDriveId)
      ?? exactMatches.find((project) => project.targetDriveId === mappedDriveId)
      ?? exactMatches[0]
      ?? null;
  }

  return exactMatches[0] ?? null;
}
