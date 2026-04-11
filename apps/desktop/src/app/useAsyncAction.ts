import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useAsyncAction — S6/H10
// ---------------------------------------------------------------------------
//
// Thin wrapper around an async operation that:
//   1. Catches rejections so event handlers never leak unhandled promise
//      rejections (the prior pattern was `onClick={() => void action()
//      .then().catch()}`, which is easy to typo and produces "not a function"
//      crashes if `.catch` is dropped).
//   2. Exposes `isPending` so callers can disable buttons during the action.
//   3. Guards against state updates after unmount via an `isMountedRef`.
//   4. Normalises unknown-shape errors to `Error` instances before invoking
//      the `onError` callback — callers never need `error instanceof Error`
//      checks at the call site.
//
// Usage:
//   const confirmMove = useAsyncAction(
//     () => confirmProjectMove(project.id),
//     {
//       onSuccess: () => setFeedback({ tone: "success", ... }),
//       onError: (err) => setFeedback({ tone: "error", messages: [err.message] })
//     }
//   );
//   <button onClick={confirmMove.run} disabled={confirmMove.isPending}>...
//
// Event-handler shape: `run` returns `void`, not `Promise<void>`. React event
// handlers that call `run` stay synchronous from TypeScript's perspective,
// so callers no longer need the `void` prefix.
// ---------------------------------------------------------------------------

export interface UseAsyncActionOptions<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

export interface UseAsyncActionReturn {
  run: () => void;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error("Unknown error");
  }
}

export function useAsyncAction<TResult>(
  action: () => Promise<TResult>,
  options: UseAsyncActionOptions<TResult> = {}
): UseAsyncActionReturn {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stable refs for the latest action + callbacks so `run` does not need to
  // be recreated on every render — callers can pass `run` directly to
  // `onClick` without destabilising child components.
  const actionRef = useRef(action);
  actionRef.current = action;

  const onSuccessRef = useRef(options.onSuccess);
  onSuccessRef.current = options.onSuccess;

  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const run = useCallback((): void => {
    setIsPending(true);
    setError(null);
    // Deliberately not returning the promise — `run` is designed for event
    // handlers whose signature is `() => void`.
    actionRef.current().then(
      (result) => {
        setIsPending(false);
        onSuccessRef.current?.(result);
      },
      (rawError: unknown) => {
        const normalised = toError(rawError);
        setIsPending(false);
        setError(normalised);
        onErrorRef.current?.(normalised);
      }
    );
  }, []);

  const reset = useCallback((): void => {
    setError(null);
    setIsPending(false);
  }, []);

  return { run, isPending, error, reset };
}
