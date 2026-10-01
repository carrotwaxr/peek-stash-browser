import { afterEach, describe, expect, it, vi } from "vitest";
import { newClientToken } from "@/utils/clientToken";

describe("newClientToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Browsers define crypto.randomUUID only in secure contexts, and Peek is
  // often opened over plain HTTP on a LAN address
  it("newClientToken works without crypto.randomUUID", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => real.getRandomValues(array),
      randomUUID: undefined,
    });

    const first = newClientToken();
    const second = newClientToken();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});
