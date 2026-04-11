import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useOptimisticMutation
// ---------------------------------------------------------------------------
//
// Extends the useAsyncAction pattern with an optimistic state layer:
//
//   idle → optimistic (immediately on mutate) → confirmed | rolled_back
//
// "Optimistic" here means the UI responds instantly — feedback is shown
// before the async action resolves, making saves feel instant regardless
// of network/DB latency.
//
// State machine:
//   idle        — no mutation in flight
//   optimistic  — mutation dispatched, outcome unknown (isPending = true)
//   confirmed   — action succeeded (isConfirmed briefly true, then resets)
//   rolled_back — action failed; error surfaced, prior state can be restored
//
// The `onRollback` callback fires only on failure, giving callers a typed
// hook to revert local state (e.g. restore the previous form values).
//
// Usage:
//   const save = useOptimisticMutation(
//     (data: MetadataPayload) => updateProjectMetadata(data),
//     {
//       onSuccess: () => showBrief("Saved"),
//       onRollback: (err, data) => {
//         restoreForm(data.previous);
//         showError(err.message);
//       }
//     }
//   );
//   <form onSubmit={(e) => { e.preventDefault(); save.mutate(payload); }}>
//   <button disabled={save.isPending}>
//     {save.isConfirmed ? "Saved ✓" : save.isPending ? "Saving…" : "Save"}
//   </button>
// ---------------------------------------------------------------------------

export interface UseOptimisticMutationOptions<TData, TResult> {
  onSuccess?: (result: TResult, data: TData) => void;
  onRollback?: (error: Error, data: TData) => void;
}

export interface UseOptimisticMutationReturn<TData> {
  mutate: (data: TData) => void;
  isPending: boolean;
  isConfirmed: boolean;
  error: Error | null;
  reset: () => void;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try { return new Error(JSON.stringify(value)); } catch { return new Error("Unknown error"); }
}

export function useOptimisticMutation<TData, TResult>(
  action: (data: TData) => Promise<TResult>,
  options: UseOptimisticMutationOptions<TData, TResult> = {}
): UseOptimisticMutationReturn<TData> {
  const [isPending, setIsPending] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;

  const onSuccessRef = useRef(options.onSuccess);
  onSuccessRef.current = options.onSuccess;

  const onRollbackRef = useRef(options.onRollback);
  onRollbackRef.current = options.onRollback;

  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutate = useCallback((data: TData): void => {
    setIsPending(true);
    setIsConfirmed(false);
    setError(null);

    // Clear any lingering "confirmed" flash timer from a prior mutation.
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }

    actionRef.current(data).then(
      (result) => {
        setIsPending(false);
        setIsConfirmed(true);
        onSuccessRef.current?.(result, data);
        // Auto-clear the confirmed flash after 2.5 s.
        confirmTimerRef.current = setTimeout(() => {
          setIsConfirmed(false);
          confirmTimerRef.current = null;
        }, 2500);
      },
      (rawError: unknown) => {
        const normalised = toError(rawError);
        setIsPending(false);
        setError(normalised);
        onRollbackRef.current?.(normalised, data);
      }
    );
  }, []);

  const reset = useCallback((): void => {
    setIsPending(false);
    setIsConfirmed(false);
    setError(null);
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  return { mutate, isPending, isConfirmed, error, reset };
}
