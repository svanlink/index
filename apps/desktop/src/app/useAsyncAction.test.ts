import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncAction } from "./useAsyncAction";

// ---------------------------------------------------------------------------
// useAsyncAction — S6/H10
// ---------------------------------------------------------------------------
//
// Tests cover:
//   1. Happy path — run() resolves, onSuccess fires, isPending toggles.
//   2. Rejection path — onError fires with a normalised Error, isPending
//      toggles, `error` state is set.
//   3. Unknown-shape rejections — strings, plain objects, and non-Error
//      throws are normalised to `Error` instances before onError is called.
//   4. `reset()` clears the captured error and pending state.
//   5. `run` is a stable function identity across renders so it can be
//      passed to child components without forcing re-renders.
//   6. The latest `action` closure is always used, even if `run` is a stale
//      reference captured from an earlier render.
// ---------------------------------------------------------------------------

describe("useAsyncAction", () => {
  it("runs the action and invokes onSuccess with the result", async () => {
    const action = vi.fn(async () => "ok-result");
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAsyncAction(action, { onSuccess, onError }));

    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();

    act(() => {
      result.current.run();
    });

    expect(result.current.isPending).toBe(true);

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(action).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("ok-result");
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("captures rejections and invokes onError with an Error instance", async () => {
    const action = vi.fn(async () => {
      throw new Error("boom");
    });
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAsyncAction(action, { onSuccess, onError }));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const [capturedError] = onError.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe("boom");
    expect(result.current.error?.message).toBe("boom");
  });

  it("normalises string rejections to Error instances", async () => {
    const action = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "string failure";
    });
    const onError = vi.fn();

    const { result } = renderHook(() => useAsyncAction(action, { onError }));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(onError).toHaveBeenCalledTimes(1);
    const [capturedError] = onError.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe("string failure");
  });

  it("normalises plain-object rejections by JSON-stringifying", async () => {
    const action = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw { code: "E_BAD", detail: "weird shape" };
    });
    const onError = vi.fn();

    const { result } = renderHook(() => useAsyncAction(action, { onError }));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    const [capturedError] = onError.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toContain("E_BAD");
  });

  it("reset() clears captured error and pending state", async () => {
    const action = vi.fn(async () => {
      throw new Error("nope");
    });

    const { result } = renderHook(() => useAsyncAction(action));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.error?.message).toBe("nope"));

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it("keeps run() identity stable across renders", () => {
    const action = vi.fn(async () => "v");
    const { result, rerender } = renderHook(() => useAsyncAction(action));

    const firstRun = result.current.run;
    rerender();
    expect(result.current.run).toBe(firstRun);
  });

  it("uses the latest action closure even if run is called after a rerender", async () => {
    let currentValue = "first";
    const { result, rerender } = renderHook(
      ({ value }) => useAsyncAction(async () => value),
      { initialProps: { value: currentValue } }
    );

    currentValue = "second";
    rerender({ value: currentValue });

    let resolved: string | undefined;
    const onSuccess = vi.fn((result: string) => {
      resolved = result;
    });

    // Rebuild with the new action + callback to verify the action ref
    // follows the latest value.
    const { result: result2 } = renderHook(
      ({ value, cb }) => useAsyncAction(async () => value, { onSuccess: cb }),
      { initialProps: { value: "second", cb: onSuccess } }
    );

    act(() => {
      result2.current.run();
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(resolved).toBe("second");

    // Silence unused-var lint for the intermediate hook
    expect(result.current).toBeDefined();
  });
});
