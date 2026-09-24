/**
 * Proxy auth trusts the username header only from the addresses in
 * PROXY_AUTH_TRUSTED_IPS, checked against the address that connected to the
 * container's nginx.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getProxyAuthTrust,
  isTrustedAddress,
  parseTrustedAddresses,
  proxyPeerAddress,
} from "../../utils/proxyAuthTrust.js";
import { reqFor } from "../helpers/controllerTestUtils.js";

const reqFrom = (remoteAddress: string | undefined, realIp?: string) =>
  reqFor(proxyPeerAddress, {
    remoteAddress,
    headers: realIp === undefined ? {} : { "X-Real-IP": realIp },
  });

describe("parseTrustedAddresses", () => {
  it("parses single addresses and CIDRs, IPv4 and IPv6", () => {
    const { list, invalid } = parseTrustedAddresses(
      "10.0.0.5, 192.168.1.0/24, fd00::/8"
    );

    expect(invalid).toEqual([]);
    expect(list).not.toBeNull();
    expect(isTrustedAddress(list!, "10.0.0.5")).toBe(true);
    expect(isTrustedAddress(list!, "192.168.1.7")).toBe(true);
    expect(isTrustedAddress(list!, "::ffff:192.168.1.7")).toBe(true);
    expect(isTrustedAddress(list!, "fd12::1")).toBe(true);
    expect(isTrustedAddress(list!, "10.0.0.6")).toBe(false);
    expect(isTrustedAddress(list!, "192.168.2.7")).toBe(false);
    expect(isTrustedAddress(list!, "fe80::1")).toBe(false);
    expect(isTrustedAddress(list!, "")).toBe(false);
    expect(isTrustedAddress(list!, "not-an-ip")).toBe(false);
  });

  it("reports invalid entries", () => {
    expect(parseTrustedAddresses("10.0.0.5, nope")).toEqual({
      list: null,
      invalid: ["nope"],
    });
    expect(
      parseTrustedAddresses("300.1.1.1, 10.0.0.0/33, fd00::/129, 10.0.0.0/x")
        .invalid
    ).toEqual(["300.1.1.1", "10.0.0.0/33", "fd00::/129", "10.0.0.0/x"]);
  });
});

describe("getProxyAuthTrust", () => {
  const original = process.env.PROXY_AUTH_TRUSTED_IPS;
  afterEach(() => {
    if (original === undefined) delete process.env.PROXY_AUTH_TRUSTED_IPS;
    else process.env.PROXY_AUTH_TRUSTED_IPS = original;
  });

  it("trusts any address when the variable is unset or empty", () => {
    delete process.env.PROXY_AUTH_TRUSTED_IPS;
    expect(getProxyAuthTrust()).toEqual({ mode: "any" });
    process.env.PROXY_AUTH_TRUSTED_IPS = "  ";
    expect(getProxyAuthTrust()).toEqual({ mode: "any" });
  });

  it("trusts only the list when it is valid", () => {
    process.env.PROXY_AUTH_TRUSTED_IPS = "192.168.1.0/24";
    const trust = getProxyAuthTrust();
    expect(trust.mode).toBe("list");
    // Memoised on the raw string
    expect(getProxyAuthTrust()).toBe(trust);
  });

  it("trusts no address when any entry is invalid", () => {
    process.env.PROXY_AUTH_TRUSTED_IPS = "192.168.1.0/24, nope";
    expect(getProxyAuthTrust()).toEqual({ mode: "none" });
  });
});

describe("proxyPeerAddress", () => {
  it("proxyPeerAddress uses X-Real-IP only when the socket peer is loopback", () => {
    for (const loopback of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(proxyPeerAddress(reqFrom(loopback, "192.168.1.5"))).toBe(
        "192.168.1.5"
      );
    }
    expect(proxyPeerAddress(reqFrom("172.18.0.3", "10.0.0.5"))).toBe(
      "172.18.0.3"
    );
  });

  it("falls back to the socket address when X-Real-IP is missing or not an address", () => {
    expect(proxyPeerAddress(reqFrom("127.0.0.1"))).toBe("127.0.0.1");
    expect(proxyPeerAddress(reqFrom("127.0.0.1", "evil, 10.0.0.5"))).toBe(
      "127.0.0.1"
    );
  });

  it("tolerates a request without a socket", () => {
    expect(proxyPeerAddress(reqFor(proxyPeerAddress))).toBe("");
  });
});
