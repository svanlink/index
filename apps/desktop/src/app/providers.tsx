import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  type ReactNode
} from "react";
import {
  buildDriveDetailView,
  type CatalogRepository,
  type CreateDriveInput,
  type CreateProjectInput,
  type ImportFoldersFromVolumeInput,
  type ImportFoldersFromVolumeResult,
  type UpdateProjectMetadataInput
} from "@drive-project-catalog/data";
import type { Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { repository } from "./catalogRepository";
import { FullScreenErrorPanel } from "./FullScreenErrorPanel";

interface StartupFailure {
  message: string;
  detail: string;
}

interface DriveDetailView {
  drive: Drive;
  projects: Project[];
  incomingProjects: Project[];
  missingProjects: Project[];
}

interface CatalogStoreContextValue {
  repository: CatalogRepository;
  projects: Project[];
  drives: Drive[];
  scans: ScanRecord[];
  scanSessions: ScanSessionSnapshot[];
  selectedProjectId: string | null;
  selectedProject: Project | null;
  selectedDriveId: string | null;
  selectedDrive: Drive | null;
  isLoading: boolean;
  isMutating: boolean;
  refresh(): Promise<void>;
  selectProject(projectId: string | null): void;
  selectDrive(driveId: string | null): void;
  listProjectScanEvents(projectId: string): Promise<ProjectScanEvent[]>;
  getDriveDetailView(driveId: string): DriveDetailView | null;
  updateProjectMetadata(input: UpdateProjectMetadataInput): Promise<Project>;
  createProject(input: CreateProjectInput): Promise<Project>;
  createDrive(input: CreateDriveInput): Promise<Drive>;
  importFoldersFromVolume(input: ImportFoldersFromVolumeInput): Promise<ImportFoldersFromVolumeResult>;
  deleteProject(projectId: string): Promise<void>;
  deleteDrive(driveId: string): Promise<void>;
  markProjectOpened(projectId: string): Promise<void>;
}

const CatalogStoreContext = createContext<CatalogStoreContextValue | null>(null);

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [scanSessions, setScanSessions] = useState<ScanSessionSnapshot[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadError, setLoadError] = useState<StartupFailure | null>(null);

  const [optimisticProjects, applyOptimisticProjectChange] = useOptimistic(
    projects,
    (current: Project[], change: { type: "delete"; id: string } | { type: "add"; project: Project }) => {
      if (change.type === "delete") return current.filter((p) => p.id !== change.id);
      if (change.type === "add") return [...current, change.project];
      return current;
    }
  );

  const [optimisticDrives, applyOptimisticDriveChange] = useOptimistic(
    drives,
    (current: Drive[], change: { type: "delete"; id: string } | { type: "add"; drive: Drive }) => {
      if (change.type === "delete") return current.filter((d) => d.id !== change.id);
      if (change.type === "add") return [...current, change.drive];
      return current;
    }
  );

  const refresh = useCallback(async () => {
    const [nextProjects, nextDrives, nextScans, nextScanSessions] = await Promise.all([
      repository.listProjects(),
      repository.listDrives(),
      repository.listScans(),
      repository.listScanSessions()
    ]);
    setProjects(nextProjects);
    setDrives(nextDrives);
    setScans(nextScans);
    setScanSessions(nextScanSessions);
  }, []);

  const bootCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextProjects, nextDrives, nextScans, nextScanSessions] = await Promise.all([
        repository.listProjects(),
        repository.listDrives(),
        repository.listScans(),
        repository.listScanSessions()
      ]);
      setProjects(nextProjects);
      setDrives(nextDrives);
      setScans(nextScans);
      setScanSessions(nextScanSessions);
      setLoadError(null);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AppProviders] Startup failed", error);
      setLoadError({
        message: "Couldn't load your library",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootCatalog();
  }, [bootCatalog]);

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>) => {
    setIsMutating(true);
    try {
      const result = await operation();
      await refresh();
      return result;
    } finally {
      setIsMutating(false);
    }
  }, [refresh]);

  const listProjectScanEvents = useCallback(
    (projectId: string) => repository.listProjectScanEvents(projectId),
    []
  );

  const getDriveDetailView = useCallback((driveId: string) => {
    return buildDriveDetailView(
      { drives, projects, scans, projectScanEvents: [], scanSessions },
      driveId
    );
  }, [drives, projects, scans, scanSessions]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedDrive = useMemo(
    () => drives.find((d) => d.id === selectedDriveId) ?? null,
    [drives, selectedDriveId]
  );

  const value = useMemo<CatalogStoreContextValue>(() => ({
    repository,
    projects: optimisticProjects,
    drives: optimisticDrives,
    scans,
    scanSessions,
    selectedProjectId,
    selectedProject,
    selectedDriveId,
    selectedDrive,
    isLoading,
    isMutating,
    refresh,
    selectProject: setSelectedProjectId,
    selectDrive: setSelectedDriveId,
    listProjectScanEvents,
    getDriveDetailView,
    updateProjectMetadata: (input) => runMutation(() => repository.updateProjectMetadata(input)),
    createProject: (input) => runMutation(() => repository.createProject(input)),
    createDrive: async (input) => {
      const tempDrive: Drive = {
        id: `temp-${Date.now()}`,
        volumeName: input.volumeName,
        displayName: input.displayName ?? input.volumeName,
        totalCapacityBytes: input.totalCapacityBytes ?? null,
        usedBytes: null,
        freeBytes: null,
        reservedIncomingBytes: 0,
        lastScannedAt: null,
        createdManually: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      startTransition(() => applyOptimisticDriveChange({ type: "add", drive: tempDrive }));
      return runMutation(() => repository.createDrive(input));
    },
    importFoldersFromVolume: (input) => runMutation(() => repository.importFoldersFromVolume(input)),
    deleteProject: async (projectId) => {
      startTransition(() => applyOptimisticProjectChange({ type: "delete", id: projectId }));
      return runMutation(() => repository.deleteProject(projectId));
    },
    deleteDrive: async (driveId) => {
      startTransition(() => applyOptimisticDriveChange({ type: "delete", id: driveId }));
      return runMutation(() => repository.deleteDrive(driveId));
    },
    markProjectOpened: (projectId) => runMutation(() => repository.markProjectOpened(projectId)),
  }), [
    optimisticDrives,
    optimisticProjects,
    getDriveDetailView,
    isLoading,
    isMutating,
    listProjectScanEvents,
    applyOptimisticDriveChange,
    applyOptimisticProjectChange,
    refresh,
    runMutation,
    scanSessions,
    scans,
    selectedDrive,
    selectedDriveId,
    selectedProject,
    selectedProjectId
  ]);

  if (loadError) {
    return (
      <StartupFailureScreen
        failure={loadError}
        onRetry={() => void bootCatalog()}
        isRetrying={isLoading}
      />
    );
  }

  return <CatalogStoreContext.Provider value={value}>{children}</CatalogStoreContext.Provider>;
}

export function useCatalogStore() {
  const context = useContext(CatalogStoreContext);
  if (!context) {
    throw new Error("useCatalogStore must be used within AppProviders");
  }
  return context;
}

function StartupFailureScreen({
  failure,
  onRetry,
  isRetrying
}: {
  failure: StartupFailure;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <FullScreenErrorPanel
      eyebrow="Startup failed"
      title={failure.message}
      description="The local catalog couldn't be opened or initialized. Your files on disk are untouched — this is a startup issue, not a data issue."
      detail={failure.detail}
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
            disabled={isRetrying}
          >
            Reload window
          </button>
        </>
      }
    />
  );
}
