/**
 * Which addresses may sign users in with PROXY_AUTH_HEADER.
 *
 * PROXY_AUTH_TRUSTED_IPS lists IPs and CIDRs (IPv4 and IPv6). The address
 * checked is the one that connected to the container's nginx: when the
 * socket peer is loopback (the bundled nginx), the X-Real-IP header, which
 * nginx overwrites with $remote_addr in every /api location; otherwise the
 * socket address. Unlike req.ip it does not move when TRUST_PROXY changes.
 */
import type { Request } from "express";
import net from "net";
import { isLoopbackAddress } from "./trustProxy.js";

export type ProxyAuthTrust =
  | { mode: "any" }
  | { mode: "list"; list: net.BlockList }
  | { mode: "none" };

const familyOf = (addr: string): "ipv4" | "ipv6" =>
  net.isIPv6(addr) ? "ipv6" : "ipv4";

/** Parse comma-separated IPs and CIDRs. Any invalid entry gives `list: null`. */
export function parseTrustedAddresses(raw: string): {
  list: net.BlockList | null;
  invalid: string[];
} {
  const list = new net.BlockList();
  const invalid: string[] = [];

  for (const entry of raw.split(",").map((part) => part.trim())) {
    if (!entry) continue;
    const slash = entry.indexOf("/");
    const addr = slash === -1 ? entry : entry.slice(0, slash);
    const family = net.isIP(addr);
    if (family === 0) {
      invalid.push(entry);
      continue;
    }
    if (slash === -1) {
      list.addAddress(addr, familyOf(addr));
      continue;
    }
    const prefixText = entry.slice(slash + 1);
    const prefix = Number(prefixText);
    if (!/^\d+$/.test(prefixText) || prefix > (family === 6 ? 128 : 32)) {
      invalid.push(entry);
      continue;
    }
    list.addSubnet(addr, prefix, familyOf(addr));
  }

  return invalid.length > 0 ? { list: null, invalid } : { list, invalid };
}

/**
 * Pass the family: without it `check` assumes IPv4, and an IPv4-mapped
 * address such as ::ffff:192.168.1.7 would never match 192.168.1.0/24.
 */
export function isTrustedAddress(list: net.BlockList, addr: string): boolean {
  return net.isIP(addr) !== 0 && list.check(addr, familyOf(addr));
}

let memo: { raw: string | undefined; trust: ProxyAuthTrust } | null = null;

/** Unset or empty: any address (warned at startup). Any invalid entry: none, failing closed. */
export function getProxyAuthTrust(): ProxyAuthTrust {
  const raw = process.env.PROXY_AUTH_TRUSTED_IPS;
  if (memo && memo.raw === raw) return memo.trust;

  let trust: ProxyAuthTrust;
  if (!raw?.trim()) {
    trust = { mode: "any" };
  } else {
    const { list } = parseTrustedAddresses(raw);
    trust = list ? { mode: "list", list } : { mode: "none" };
  }
  memo = { raw, trust };
  return trust;
}

/** The address that connected to the container's nginx (see the file comment). */
export function proxyPeerAddress(req: Request): string {
  // Mock requests in tests may have no socket
  const socketAddress = req.socket?.remoteAddress ?? "";
  if (isLoopbackAddress(socketAddress)) {
    const realIp = req.header("x-real-ip")?.trim();
    if (realIp && net.isIP(realIp) !== 0) return realIp;
  }
  return socketAddress;
}
