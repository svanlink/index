import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowDragRegions } from "./useWindowDragRegions";

const { getCurrentWindowMock, startDraggingMock } = vi.hoisted(() => ({
  getCurrentWindowMock: vi.fn(),
  startDraggingMock: vi.fn(() => Promise.resolve())
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    getCurrentWindowMock();
    return {
      startDragging: startDraggingMock
    };
  }
}));

type TauriWindow = Window & typeof globalThis & { __TAURI_INTERNALS__?: unknown };

function enableTauriRuntime() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {}
  });
}

function disableTauriRuntime() {
  delete (window as TauriWindow).__TAURI_INTERNALS__;
}

function dispatchMouseDown(target: Element, button: number) {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    button,
    cancelable: true
  });
  Object.defineProperty(event, "button", { value: button });
  fireEvent(target, event);
}

function Harness() {
  useWindowDragRegions();

  return (
    <div>
      <div data-app-drag-region>
        <div data-testid="chrome-blank">Chrome blank</div>
        <button type="button">Action</button>
        <input aria-label="Search" />
        <div data-testid="explicit-no-drag" data-app-no-drag>
          Content
        </div>
      </div>
      <main data-testid="scroll-container">Scrollable app content</main>
    </div>
  );
}

describe("useWindowDragRegions", () => {
  beforeEach(() => {
    getCurrentWindowMock.mockClear();
    startDraggingMock.mockClear();
    disableTauriRuntime();
  });

  it("starts native dragging from a marked non-interactive region", async () => {
    enableTauriRuntime();
    render(<Harness />);
    await waitFor(() => expect(getCurrentWindowMock).toHaveBeenCalledTimes(1));

    dispatchMouseDown(screen.getByTestId("chrome-blank"), 0);

    expect(startDraggingMock).toHaveBeenCalledTimes(1);
  });

  it("does not drag from controls inside a drag region", () => {
    enableTauriRuntime();
    render(<Harness />);

    dispatchMouseDown(screen.getByRole("button", { name: "Action" }), 0);
    dispatchMouseDown(screen.getByLabelText("Search"), 0);
    dispatchMouseDown(screen.getByTestId("explicit-no-drag"), 0);

    expect(startDraggingMock).not.toHaveBeenCalled();
  });

  it("ignores non-primary pointer buttons", () => {
    enableTauriRuntime();
    render(<Harness />);

    dispatchMouseDown(screen.getByTestId("chrome-blank"), 2);

    expect(startDraggingMock).not.toHaveBeenCalled();
  });

  it("does not drag from unmarked scroll/content areas", () => {
    enableTauriRuntime();
    render(<Harness />);

    dispatchMouseDown(screen.getByTestId("scroll-container"), 0);

    expect(startDraggingMock).not.toHaveBeenCalled();
  });

  it("is a no-op outside the Tauri runtime", () => {
    render(<Harness />);

    dispatchMouseDown(screen.getByTestId("chrome-blank"), 0);

    expect(startDraggingMock).not.toHaveBeenCalled();
  });
});
