import { useEffect, type Dispatch, type SetStateAction } from "react";

/**
 * Shared feedback-notice state shape used by pages that surface transient
 * success/warning/error banners via `<FeedbackNotice />`.
 */
export type FeedbackState = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  messages: string[];
} | null;

/**
 * Auto-dismiss the given feedback state after `delayMs` (default 2800ms).
 * Clears the prior timer on every feedback change so rapidly-changing notices
 * never stack. Pages wire this up once and otherwise just call
 * `setFeedback(...)` to post a new notice.
 */
export function useFeedbackDismiss(
  feedback: FeedbackState,
  setFeedback: Dispatch<SetStateAction<FeedbackState>>,
  delayMs = 2800
) {
  useEffect(() => {
    if (!feedback) return;
    const timeoutId = window.setTimeout(() => setFeedback(null), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [feedback, setFeedback, delayMs]);
}
