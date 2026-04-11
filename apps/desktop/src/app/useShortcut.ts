import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// useShortcut — Design 2 (hook-per-shortcut, co-located with the feature)
//
// Registers a single keyboard shortcut on the window. The shortcut is
// automatically deregistered when the component unmounts, so route-scoped
// shortcuts work without any manual `when` predicate — just call this hook
// inside the page component that owns the action.
//
// Text-input guard: the shortcut never fires when focus is inside an input,
// textarea, select, or contentEditable element, unless `allowInTextInput` is
// explicitly set to true.
//
// The `onTrigger` callback is always read from a ref so that stale closures
// are never a concern — callers can pass inline functions without wrapping
// them in useCallback.
// ---------------------------------------------------------------------------

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable
  );
}

export interface UseShortcutOptions {
  /** The key to match, e.g. "n", ",", "r", "Escape", "/" */
  key: string;
  /** Require Cmd (macOS) / Ctrl (Win/Linux). Default: false. */
  meta?: boolean;
  /** Callback invoked when the shortcut fires. */
  onTrigger: () => void;
  /** Set to false to suspend the shortcut without unmounting. Default: true. */
  enabled?: boolean;
  /** Allow the shortcut to fire even when a text input is focused. Default: false. */
  allowInTextInput?: boolean;
}

export function useShortcut({
  key,
  meta = false,
  onTrigger,
  enabled = true,
  allowInTextInput = false
}: UseShortcutOptions): void {
  // Stable ref so the handler always calls the latest onTrigger without
  // needing to re-add/remove the event listener on every render.
  const handlerRef = useRef(onTrigger);
  handlerRef.current = onTrigger;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!allowInTextInput && isTypingTarget(e.target)) return;

      const wantsMeta = meta;
      const hasMeta = e.metaKey || e.ctrlKey;
      if (wantsMeta !== hasMeta) return;

      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      e.preventDefault();
      handlerRef.current();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key, meta, enabled, allowInTextInput]);
}
