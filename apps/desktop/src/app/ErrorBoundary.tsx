import { Component, type ErrorInfo, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// ErrorBoundary — S6/H9
// ---------------------------------------------------------------------------
//
// Global React error boundary that catches render-phase errors anywhere in
// the tree. Without this, a single thrown render error propagates to the
// React root and blanks the entire app — the user gets a white screen with
// no feedback and no recovery path.
//
// Scope:
//   - Catches render, lifecycle, and constructor errors in descendant
//     components (React's standard componentDidCatch contract).
//   - Does NOT catch event handlers, async code, or errors thrown inside
//     useEffect — those still need their own handling at the call site.
//   - Resets on demand via the "Try again" button, clearing the captured
//     error and re-rendering children.
//
// Why a class component:
//   React has no hook equivalent for error boundaries as of React 19.
//   getDerivedStateFromError + componentDidCatch are class-only APIs.
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional fallback renderer. Receives the captured error and a reset
   * callback. If omitted, a built-in recovery screen is rendered.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Optional error reporter. Called once per captured error with both the
   * error and React's componentStack info. Use this to wire telemetry.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure in the dev console; production telemetry can be
    // wired in via the onError prop.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Captured render error:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return <DefaultErrorFallback error={error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Default fallback UI
// ---------------------------------------------------------------------------

interface DefaultErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

function DefaultErrorFallback({ error, onReset }: DefaultErrorFallbackProps) {
  const message = error.message || "An unexpected error occurred.";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="app-panel w-full max-w-md space-y-4 px-6 py-6">
        <div className="space-y-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--color-danger)" }}
          >
            Something went wrong
          </p>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--color-text)" }}>
            The catalog hit an unexpected error
          </h1>
        </div>

        <p className="text-[13px]" style={{ color: "var(--color-text-soft)" }}>
          {message}
        </p>

        <p className="text-[12px]" style={{ color: "var(--color-text-soft)" }}>
          Your data is safe. You can try recovering this view, or reload the window if the
          problem persists.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="button-secondary" onClick={onReset}>
            Try again
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => window.location.reload()}
          >
            Reload window
          </button>
        </div>
      </div>
    </div>
  );
}
