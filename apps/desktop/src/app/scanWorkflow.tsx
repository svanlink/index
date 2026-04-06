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
  getScanStatusMessage,
  getActiveScanSession,
  getLatestCompletedScanSession,
  getLatestTerminalScanSession,
  isTerminalScanStatus
} from "@drive-project-catalog/data";
import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { useCatalogStore } from "./providers";
import {
  chooseCatalogScanDirectory,
  cancelCatalogScan,
  isDesktopScanAvailable,
  reconcilePersistedScanSessions,
  startCatalogScan,
  syncDesktopScanSession
} from "./catalogActions";

const POLL_INTERVAL_MS = 900;

interface ScanWorkflowContextValue {
  isDesktopScanAvailable: boolean;
  isPanelOpen: boolean;
  draftRootPath: string;
  selectedDriveId: string;
  isPickingDirectory: boolean;
  activeScanId: string | null;
  activeSession: ScanSessionSnapshot | null;
  latestCompletedSession: ScanSessionSnapshot | null;
  latestTerminalSession: ScanSessionSnapshot | null;
  lastError: string | null;
  openPanel(): void;
  closePanel(): void;
  setDraftRootPath(path: string): void;
  setSelectedDriveId(driveId: string): void;
  chooseDirectory(): Promise<void>;
  startScan(): Promise<void>;
  cancelScan(): Promise<void>;
}

const ScanWorkflowContext = createContext<ScanWorkflowContextValue | null>(null);

export function ScanWorkflowProvider({ children }: { children: ReactNode }) {
  const { repository, refresh, scanSessions, drives } = useCatalogStore();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [draftRootPath, setDraftRootPath] = useState("");
  const [selectedDriveId, setSelectedDriveId] = useState("");
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const requestedDriveIdRef = useRef<string | null>(null);
  const desktopAvailable = isDesktopScanAvailable();

  const activeSession = useMemo(
    () => (activeScanId ? scanSessions.find((session) => session.scanId === activeScanId) ?? null : getActiveScanSession(scanSessions)),
    [activeScanId, scanSessions]
  );
  const latestCompletedSession = useMemo(
    () => getLatestCompletedScanSession(scanSessions),
    [scanSessions]
  );
  const latestTerminalSession = useMemo(
    () => getLatestTerminalScanSession(scanSessions),
    [scanSessions]
  );

  const clearPollTimer = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const syncSession = useCallback(async (scanId: string, requestedDriveId?: string | null) => {
    const session = await syncDesktopScanSession(repository, scanId, requestedDriveId);
    await refresh();
    return session;
  }, [refresh, repository]);

  const pollScan = useCallback(async (scanId: string, requestedDriveId?: string | null) => {
    try {
      const session = await syncSession(scanId, requestedDriveId);
      if (!session) {
        setActiveScanId(null);
        setLastError("The desktop scan session could not be found anymore.");
        return;
      }

      if (isTerminalScanStatus(session.status)) {
        setActiveScanId(null);
        setLastError(
          session.status === "failed" || session.status === "interrupted"
            ? getScanStatusMessage(session)
            : null
        );
        return;
      }

      pollTimeoutRef.current = window.setTimeout(() => {
        void pollScan(scanId, requestedDriveId);
      }, POLL_INTERVAL_MS);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to poll desktop scan session.");
      setActiveScanId(null);
    }
  }, [syncSession]);

  const chooseDirectory = useCallback(async () => {
    if (!desktopAvailable) {
      setLastError("The native folder picker is only available inside the Tauri desktop app.");
      return;
    }

    setIsPickingDirectory(true);
    setLastError(null);

    try {
      const selectedPath = await chooseCatalogScanDirectory(draftRootPath || null);
      if (selectedPath) {
        setDraftRootPath(selectedPath);
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to open the native folder picker.");
    } finally {
      setIsPickingDirectory(false);
    }
  }, [desktopAvailable, draftRootPath]);

  const startScan = useCallback(async () => {
    if (!desktopAvailable) {
      setLastError("Desktop scan commands are only available inside the Tauri desktop app.");
      return;
    }
    if (!draftRootPath.trim()) {
      setLastError("A scan target path is required.");
      return;
    }

    clearPollTimer();
    setLastError(null);

    try {
      const selectedDrive = drives.find((drive) => drive.id === selectedDriveId) ?? null;
      const { response, requestedDriveId } = await startCatalogScan(repository, {
        rootPath: draftRootPath.trim(),
        requestedDriveId: selectedDriveId || null,
        requestedDriveName: selectedDrive?.displayName ?? selectedDrive?.volumeName ?? null
      });

      requestedDriveIdRef.current = requestedDriveId;
      setActiveScanId(response.scanId);
      setIsPanelOpen(true);
      setLastError(null);
      await refresh();
      await pollScan(response.scanId, requestedDriveId);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to start the desktop scan.");
    }
  }, [clearPollTimer, desktopAvailable, draftRootPath, drives, pollScan, refresh, repository, selectedDriveId]);

  const cancelScan = useCallback(async () => {
    if (!activeScanId) {
      return;
    }

    clearPollTimer();
    setLastError(null);
    try {
      await cancelCatalogScan(repository, activeScanId, requestedDriveIdRef.current);
      await refresh();
      setActiveScanId(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to cancel the desktop scan.");
    }
  }, [activeScanId, clearPollTimer, refresh, repository]);

  useEffect(() => {
    if (!desktopAvailable) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { liveSessions, interruptedSessions } = await reconcilePersistedScanSessions(repository);
        if (cancelled) {
          return;
        }

        await refresh();
        const latestInterrupted = interruptedSessions
          .sort((left, right) => (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt))[0] ?? null;
        if (latestInterrupted) {
          setLastError(getScanStatusMessage(latestInterrupted));
        }

        const runningSession = liveSessions.find((session) => session && !isTerminalScanStatus(session.status));
        if (runningSession) {
          requestedDriveIdRef.current = runningSession.requestedDriveId ?? null;
          setActiveScanId(runningSession.scanId);
          await pollScan(runningSession.scanId, runningSession.requestedDriveId ?? null);
        }
      } catch {
        // Ignore desktop scan bootstrap errors in web mode or when no live sessions exist.
      }
    })();

    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [clearPollTimer, desktopAvailable, pollScan, refresh, repository]);

  useEffect(() => {
    if (selectedDriveId) {
      const selectedDrive = drives.find((drive) => drive.id === selectedDriveId);
      if (selectedDrive && !draftRootPath) {
        setDraftRootPath(`/Volumes/${selectedDrive.volumeName}`);
      }
    }
  }, [draftRootPath, drives, selectedDriveId]);

  const value = useMemo<ScanWorkflowContextValue>(() => ({
    isDesktopScanAvailable: desktopAvailable,
    isPanelOpen,
    draftRootPath,
    selectedDriveId,
    isPickingDirectory,
    activeScanId,
    activeSession,
    latestCompletedSession,
    latestTerminalSession,
    lastError,
    openPanel: () => setIsPanelOpen(true),
    closePanel: () => setIsPanelOpen(false),
    setDraftRootPath,
    setSelectedDriveId,
    chooseDirectory,
    startScan,
    cancelScan
  }), [
    activeScanId,
    activeSession,
    cancelScan,
    chooseDirectory,
    desktopAvailable,
    draftRootPath,
    isPickingDirectory,
    isPanelOpen,
    lastError,
    latestCompletedSession,
    latestTerminalSession,
    selectedDriveId,
    startScan
  ]);

  return <ScanWorkflowContext.Provider value={value}>{children}</ScanWorkflowContext.Provider>;
}

export function useScanWorkflow() {
  const context = useContext(ScanWorkflowContext);

  if (!context) {
    throw new Error("useScanWorkflow must be used within ScanWorkflowProvider");
  }

  return context;
}
