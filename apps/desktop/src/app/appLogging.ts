import {
  debug as pluginDebug,
  error as pluginError,
  info as pluginInfo,
  trace as pluginTrace,
  warn as pluginWarn
} from "@tauri-apps/plugin-log";

type Logger = (message: string) => Promise<void>;
type LoggingWindow = Window & typeof globalThis & {
  __CATALOG_LOGGING_INITIALIZED__?: boolean;
  __TAURI_INTERNALS__?: unknown;
};

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatLogArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === "string") {
    return arg;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function forwardConsoleMethod(
  method: "debug" | "error" | "info" | "log" | "warn",
  logger: Logger,
  original: Console
) {
  const originalMethod = original[method].bind(original);
  console[method] = (...args: unknown[]) => {
    originalMethod(...args);
    const message = args.map(formatLogArg).join(" ");
    void logger(`[frontend] ${message}`).catch(() => undefined);
  };
}

export function initializeAppLogging(): void {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const loggingWindow = window as LoggingWindow;
  if (loggingWindow.__CATALOG_LOGGING_INITIALIZED__) {
    return;
  }
  loggingWindow.__CATALOG_LOGGING_INITIALIZED__ = true;

  const originalConsole = {
    debug: console.debug.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console)
  } as Console;

  forwardConsoleMethod("debug", pluginDebug, originalConsole);
  forwardConsoleMethod("error", pluginError, originalConsole);
  forwardConsoleMethod("info", pluginInfo, originalConsole);
  forwardConsoleMethod("log", pluginTrace, originalConsole);
  forwardConsoleMethod("warn", pluginWarn, originalConsole);

  console.info("[logging] frontend logging initialized");
}
