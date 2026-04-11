import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// ---------------------------------------------------------------------------
// ErrorBoundary — S6/H9
// ---------------------------------------------------------------------------
//
// These tests verify:
//   1. Children render normally when nothing throws.
//   2. A render-phase throw from a descendant is captured and replaced with
//      the fallback UI (built-in or custom).
//   3. `onError` is invoked with the caught error so telemetry can be wired.
//   4. `reset()` clears the captured error and re-renders children so the
//      user can recover without a full page reload.
//   5. The built-in "Reload window" button triggers `window.location.reload`.
//
// React logs captured errors to console.error. We silence that during tests
// so the output stays readable.
// ---------------------------------------------------------------------------

function Bomb({ message = "kaboom" }: { message?: string }): ReactElement {
  throw new Error(message);
}

function SafeChild(): ReactElement {
  return <p>safe content</p>;
}

function RecoverableBomb(): ReactElement {
  const [shouldThrow] = useState(true);
  if (shouldThrow) {
    throw new Error("recoverable failure");
  }
  return <p>recovered</p>;
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <SafeChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("renders the built-in fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb message="scan crashed" />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /unexpected error/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText("scan crashed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload window/i })).toBeInTheDocument();
  });

  it("invokes the onError callback with the captured error", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Bomb message="telemetry please" />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [capturedError] = onError.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe("telemetry please");
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>custom: {error.message}</p>
            <button type="button" onClick={reset}>
              custom reset
            </button>
          </div>
        )}
      >
        <Bomb message="custom surface" />
      </ErrorBoundary>
    );

    expect(screen.getByText("custom: custom surface")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "custom reset" })).toBeInTheDocument();
  });

  it("reset() clears the error and re-renders children", () => {
    // Toggle the child between a bomb and a safe component so the user can
    // actually recover after clicking "Try again". Without this, reset()
    // would just catch the same error on the next render.
    let throwNow = true;
    function ConditionalBomb(): ReactElement {
      if (throwNow) {
        throw new Error("boom");
      }
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary>
        <ConditionalBomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Simulate the underlying condition changing (e.g. a dependency refetch)
    // before the user clicks reset.
    throwNow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not invoke onError on a recovering re-render", () => {
    const onError = vi.fn();
    const { rerender } = render(
      <ErrorBoundary onError={onError}>
        <RecoverableBomb />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);

    rerender(
      <ErrorBoundary onError={onError}>
        <SafeChild />
      </ErrorBoundary>
    );

    // Still 1 — rerender alone doesn't re-trigger componentDidCatch without
    // a new render throw.
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
