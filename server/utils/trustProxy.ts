/**
 * Express `trust proxy` setting from TRUST_PROXY.
 *
 * The production image runs nginx in the same container, so every request
 * reaches the server from a loopback address. proxy-addr walks the hops from
 * the socket outward and stops at the first untrusted one, so hop 1 and later
 * are only reached after a loopback hop 0. On a bare `node` run with a proxy
 * directly in front, nothing is trusted and nothing can be spoofed.
 */

export type TrustProxySetting =
  | boolean
  | string
  | ((addr: string, hop: number) => boolean);

export const isLoopbackAddress = (addr: string): boolean =>
  addr === "::1" || addr.startsWith("127.") || addr.startsWith("::ffff:127.");

/** TRUST_PROXY: unset/"0" = only the image's own nginx (a loopback hop); N = N reverse proxies in front of the container; "true" = trust all (not documented); anything else = Express address list, loopback prepended. */
export function resolveTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim();
  if (!value || /^\d+$/.test(value)) {
    const extraHops = value ? parseInt(value, 10) : 0;
    return (addr, hop) =>
      hop === 0 ? isLoopbackAddress(addr) : hop <= extraHops;
  }
  if (value === "true") return true;
  return /\bloopback\b/.test(value) ? value : `loopback, ${value}`;
}
