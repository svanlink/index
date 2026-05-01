import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const dragRegionSelector = "[data-app-drag-region]";

const noDragSelector = [
  "[data-app-no-drag]",
  "a",
  "button",
  "input",
  "label",
  "option",
  "select",
  "summary",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='combobox']",
  "[role='link']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='slider']",
  "[role='switch']",
  "[role='tab']",
  "[role='textbox']"
].join(",");

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Starts a native macOS window drag from intentional, non-interactive chrome.
 *
 * Tauri's declarative drag regions can be brittle once the titlebar is hidden
 * or overlaid. This hook gives the app shell a single fallback path while
 * keeping normal controls clickable/selectable.
 */
export function useWindowDragRegions(): void {
  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    const appWindow = getCurrentWindow();

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0 || event.defaultPrevented) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target || !target.closest(dragRegionSelector)) {
        return;
      }

      if (target.closest(noDragSelector)) {
        return;
      }

      event.preventDefault();
      void appWindow.startDragging().catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[window-drag] native drag failed", error);
      });
    }

    document.addEventListener("mousedown", handleMouseDown, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, { capture: true });
    };
  }, []);
}
