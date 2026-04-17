import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  buildDriveDetailView,
  type CatalogRepository,
  type CreateDriveInput,
  type CreateProjectInput,
  type DashboardSnapshot,
  type ImportFoldersFromVolumeInput,
  type ImportFoldersFromVolumeResult,
  type StartupSyncResult,
  type SyncCycleResult,
  type SyncState,
  type UpdateProjectMetadataInput
} from "@drive-project-catalog/data";
import type { Category, Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { repository } from "./catalogRepository";
import {
  assignProjectsToDrive as assignProjectsToDriveAction,
  deleteProjects as deleteProjectsAction,
  planProjectsMove as planProjectsMoveAction,
  setProjectsCategory as setProjectsCategoryAction
} from "./batchProjectActions";
import { FullScreenErrorPanel } from "./FullScreenErrorPanel";

// ---------------------------------------------------------------------------
// Startup failure shape
// ---------------------------------------------------------------------------
//
// `message` is user-facing and stable ("Couldn't load your library"). `detail`
// is the normalised error.message string — shown in a collapsed diagnostic
// block. The raw error is kept on the side purely for dev console logging and
// is deliberately not stored in React state (cyclic refs, Error shapes vary).
// ---------------------------------------------------------------------------

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
  dashboard: DashboardSnapshot;
  selectedProjectId: string | null;
  selectedProject: Project | null;
  selectedDriveId: string | null;
  selectedDrive: Drive | null;
  syncState: SyncState;
  startupSyncResult: StartupSyncResult | null;
  isLoading: boolean;
  isMutating: boolean;
  isSyncing: boolean;
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
  planProjectMove(projectId: string, targetDriveId: string): Promise<Project>;
  confirmProjectMove(projectId: string): Promise<Project>;
  cancelProjectMove(projectId: string): Promise<Project>;
  assignProjectsToDrive(projectIds: string[], driveId: string | null): Promise<void>;
  setProjectsCategory(projectIds: string[], category: Category | null): Promise<void>;
  planProjectsMove(projectIds: string[], targetDriveId: string): Promise<void>;
  deleteProjects(projectIds: string[]): Promise<void>;
  syncNow(): Promise<SyncCycleResult>;
}

const emptyDashboard: DashboardSnapshot = {
  recentScans: [],
  recentProjects: [],
  moveReminders: [],
  statusAlerts: []
};

const emptySyncState: SyncState = {
  mode: "local-only",
  pendingCount: 0,
  queuedCount: 0,
  failedCount: 0,
  inFlightCount: 0,
  syncInProgress: false,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
  lastSyncError: null,
  remoteCursor: null,
  conflictPolicy: "updated-at-last-write-wins-local-tie-break"
};

const CatalogStoreContext = createContext<CatalogStoreContextValue | null>(null);

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [scanSessions, setScanSessions] = useState<ScanSessionSnapshot[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(emptyDashboard);
  const [syncState, setSyncState] = useState<SyncState>(emptySyncState);
  const [startupSyncResult, setStartupSyncResult] = useState<StartupSyncResult | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<StartupFailure | null>(null);
  const startupSyncHasRunRef = useRef(false);

  const refresh = useCallback(async () => {
    const [nextProjects, nextDrives, nextScans, nextScanSessions, nextDashboard, nextSyncState] = await Promise.all([
      repository.listProjects(),
      repository.listDrives(),
      repository.listScans(),
      repository.listScanSessions(),
      repository.getDashboardSnapshot(),
      repository.getSyncState()
    ]);

    setProjects(nextProjects);
    setDrives(nextDrives);
    setScans(nextScans);
    setScanSessions(nextScanSessions);
    setDashboard(nextDashboard);
    setSyncState(nextSyncState);
  }, []);

  // -------------------------------------------------------------------------
  // bootCatalog — stable function used for both initial mount and retry.
  //
  // Product rules encoded here:
  //   1. Local load failure is FATAL — the app cannot pretend to be ready
  //      with empty state; it must render a failure screen.
  //   2. Startup sync failure is NON-FATAL — local-first means the app works
  //      without sync; sync errors are logged and surfaced via the sync panel,
  //      not by blocking the whole app.
  //   3. `loadError` is cleared ONLY after a successful local load so a retry
  //      does not flicker through an empty children tree on its way back to
  //      either success or a second failure.
  //   4. Retry calls this same function — there is no separate retry path
  //      that could drift from the initial boot path over time.
  // -------------------------------------------------------------------------
  const bootCatalog = useCallback(async () => {
    setIsLoading(true);

    try {
      const [nextProjects, nextDrives, nextScans, nextScanSessions, nextDashboard, nextSyncState] = await Promise.all([
        repository.listProjects(),
        repository.listDrives(),
        repository.listScans(),
        repository.listScanSessions(),
        repository.getDashboardSnapshot(),
        repository.getSyncState()
      ]);

      setProjects(nextProjects);
      setDrives(nextDrives);
      setScans(nextScans);
      setScanSessions(nextScanSessions);
      setDashboard(nextDashboard);
      setSyncState(nextSyncState);
      // Only clear the failure banner AFTER we have confirmed good data.
      setLoadError(null);

      if (!startupSyncHasRunRef.current) {
        startupSyncHasRunRef.current = true;
        setIsSyncing(true);
        try {
          const startupResult = await repository.startupSync({
            isOnline: typeof navigator === "undefined" ? true : navigator.onLine
          });
          setStartupSyncResult(startupResult);
          await refresh();
        } catch (syncError) {
          // Non-fatal — the local catalog is already loaded. Log for dev and
          // allow the app to proceed. Sync status surfacing lives in the
          // dedicated sync panel, not in the boot path.
          // eslint-disable-next-line no-console
          console.error("[AppProviders] Startup sync failed (non-fatal)", syncError);
        } finally {
          setIsSyncing(false);
        }
      }
    } catch (error) {
      // Local load failed — this is fatal for the app.
      // eslint-disable-next-line no-console
      console.error("[AppProviders] Startup local load failed", error);
      setLoadError({
        message: "Couldn't load your library",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

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

  const listProjectScanEvents = useCallback((projectId: string) => repository.listProjectScanEvents(projectId), []);

  const getDriveDetailView = useCallback((driveId: string) => {
    return buildDriveDetailView(
      {
        drives,
        projects,
        scans,
        projectScanEvents: [],
        scanSessions
      },
      driveId
    );
  }, [drives, projects, scans, scanSessions]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedDrive = useMemo(
    () => drives.find((drive) => drive.id === selectedDriveId) ?? null,
    [drives, selectedDriveId]
  );

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await repository.syncNow();
      await refresh();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  const value = useMemo<CatalogStoreContextValue>(() => ({
    repository,
    projects,
    drives,
    scans,
    scanSessions,
    dashboard,
    selectedProjectId,
    selectedProject,
    selectedDriveId,
    selectedDrive,
    syncState,
    startupSyncResult,
    isLoading,
    isMutating,
    isSyncing,
    refresh,
    selectProject: setSelectedProjectId,
    selectDrive: setSelectedDriveId,
    listProjectScanEvents,
    getDriveDetailView,
    updateProjectMetadata: (input) => runMutation(() => repository.updateProjectMetadata(input)),
    createProject: (input) => runMutation(() => repository.createProject(input)),
    createDrive: (input) => runMutation(() => repository.createDrive(input)),
    importFoldersFromVolume: (input) => runMutation(() => repository.importFoldersFromVolume(input)),
    deleteProject: (projectId) => runMutation(() => repository.deleteProject(projectId)),
    deleteDrive: (driveId) => runMutation(() => repository.deleteDrive(driveId)),
    planProjectMove: (projectId, targetDriveId) => runMutation(() => repository.planProjectMove(projectId, targetDriveId)),
    confirmProjectMove: (projectId) => runMutation(() => repository.confirmProjectMove(projectId)),
    cancelProjectMove: (projectId) => runMutation(() => repository.cancelProjectMove(projectId)),
    assignProjectsToDrive: (projectIds, driveId) => runMutation(() => assignProjectsToDriveAction(repository, projectIds, driveId)),
    setProjectsCategory: (projectIds, category) => runMutation(() => setProjectsCategoryAction(repository, projectIds, category)),
    planProjectsMove: (projectIds, targetDriveId) => runMutation(() => planProjectsMoveAction(repository, projectIds, targetDriveId)),
    deleteProjects: (projectIds) => runMutation(() => deleteProjectsAction(repository, projectIds)),
    syncNow
  }), [
    dashboard,
    drives,
    getDriveDetailView,
    isLoading,
    isMutating,
    isSyncing,
    listProjectScanEvents,
    projects,
    refresh,
    runMutation,
    scanSessions,
    scans,
    selectedDrive,
    selectedDriveId,
    selectedProject,
    selectedProjectId,
    syncNow,
    syncState,
    startupSyncResult
  ]);

  // If the initial local load failed, render the failure screen INSTEAD of
  // the children. Product rule: empty state and failed state must never share
  // the same visual result. Rendering outside the context provider also means
  // the failure screen is self-contained — it does not need (and never
  // accidentally exposes) a half-populated catalog context.
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

// ---------------------------------------------------------------------------
// StartupFailureScreen
// ---------------------------------------------------------------------------
//
// Renders when the initial catalog load rejects. The primary action retries
// the SAME boot function the app uses on mount, so the retry path can never
// drift from the initial path. The window-reload escape hatch is preserved
// for the pathological case where retry can't succeed (e.g. corrupt on-disk
// state that a restart would re-evaluate from scratch).
// ---------------------------------------------------------------------------
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
            className="button-primary"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
          <button
            type="button"
            className="button-secondary"
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

