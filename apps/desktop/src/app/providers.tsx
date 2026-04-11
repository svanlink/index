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
  type ReclassifyLegacyFolderTypesResult,
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
  reclassifyLegacyFolderTypes(): Promise<ReclassifyLegacyFolderTypesResult>;
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

  useEffect(() => {
    let isMounted = true;

    void (async () => {
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

        if (!isMounted) {
          return;
        }

        setProjects(nextProjects);
        setDrives(nextDrives);
        setScans(nextScans);
        setScanSessions(nextScanSessions);
        setDashboard(nextDashboard);
        setSyncState(nextSyncState);

        if (!startupSyncHasRunRef.current) {
          startupSyncHasRunRef.current = true;
          setIsSyncing(true);
          try {
            const startupResult = await repository.startupSync({
              isOnline: typeof navigator === "undefined" ? true : navigator.onLine
            });
            if (!isMounted) {
              return;
            }
            setStartupSyncResult(startupResult);
            await refresh();
          } finally {
            if (isMounted) {
              setIsSyncing(false);
            }
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [refresh]);

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
    reclassifyLegacyFolderTypes: () => runMutation(() => repository.reclassifyLegacyFolderTypes()),
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

  return <CatalogStoreContext.Provider value={value}>{children}</CatalogStoreContext.Provider>;
}

export function useCatalogStore() {
  const context = useContext(CatalogStoreContext);

  if (!context) {
    throw new Error("useCatalogStore must be used within AppProviders");
  }

  return context;
}

