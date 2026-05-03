import { type RefObject, useEffect } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

/**
 * Traps keyboard focus inside `ref` for the lifetime of the component.
 *
 * - Tab / Shift+Tab cycles through focusable descendants; wraps at both ends.
 * - Focuses the first focusable descendant on mount (falls back to the
 *   container element itself).
 * - Restores focus to whichever element had it before the trap opened.
 *
 * The hook is intentionally dependency-free so callers don't have to pass
 * callbacks. The `onEscape` handler in each dialog's own keydown listener
 * takes care of Escape — this hook only manages Tab containment and
 * focus restore.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable(): HTMLElement[] {
      if (!el) return [];
      return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === el) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || active === el) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    // Move focus to first interactive child; fall back to the container itself.
    const focusable = getFocusable();
    (focusable[0] ?? el).focus();

    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
