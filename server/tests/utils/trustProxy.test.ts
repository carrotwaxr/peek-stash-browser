import { describe, expect, it } from "vitest";
import { resolveTrustProxy } from "../../utils/trustProxy.js";

type TrustFn = (addr: string, hop: number) => boolean;

const asFunction = (raw: string | undefined): TrustFn => {
  const setting = resolveTrustProxy(raw);
  expect(typeof setting).toBe("function");
  return setting as TrustFn;
};

describe("resolveTrustProxy", () => {
  it("trusts only a loopback first hop by default", () => {
    const f = asFunction(undefined);
    expect(f("127.0.0.1", 0)).toBe(true);
    expect(f("::1", 0)).toBe(true);
    expect(f("::ffff:127.0.0.1", 0)).toBe(true);
    expect(f("172.17.0.2", 0)).toBe(false);
    expect(f("203.0.113.7", 1)).toBe(false);
  });

  it("a number counts reverse proxies in front of the container", () => {
    const f = asFunction("1");
    expect(f("127.0.0.1", 0)).toBe(true);
    expect(f("172.18.0.5", 1)).toBe(true);
    expect(f("203.0.113.7", 2)).toBe(false);
  });

  it("never trusts past a non-loopback first hop", () => {
    const f = asFunction("2");
    expect(f("172.18.0.5", 0)).toBe(false);
  });

  it("0 means the default", () => {
    const f = asFunction("0");
    expect(f("127.0.0.1", 0)).toBe(true);
    expect(f("172.17.0.2", 0)).toBe(false);
    expect(f("203.0.113.7", 1)).toBe(false);
  });

  it('"true" trusts every hop', () => {
    expect(resolveTrustProxy("true")).toBe(true);
  });

  it("an address list gets loopback prepended", () => {
    expect(resolveTrustProxy("172.18.0.0/16")).toBe("loopback, 172.18.0.0/16");
    expect(resolveTrustProxy("loopback, 172.18.0.0/16")).toBe(
      "loopback, 172.18.0.0/16"
    );
  });
});
