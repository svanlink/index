import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  globalThis.AbortController = window.AbortController;
  globalThis.AbortSignal = window.AbortSignal;
}

const NativeRequest = globalThis.Request;

class RequestShim extends NativeRequest {
  constructor(input: ConstructorParameters<typeof Request>[0], init?: ConstructorParameters<typeof Request>[1]) {
    try {
      super(input, init);
    } catch (error) {
      if (init && typeof init === "object" && "signal" in init) {
        const { signal: _signal, ...nextInit } = init;
        super(input, nextInit);
        return;
      }

      throw error;
    }
  }
}

globalThis.Request = RequestShim;

afterEach(() => {
  cleanup();
});
