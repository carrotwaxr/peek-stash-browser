import type { Request } from "express";

// Browser Origin/Referer describe the external scheme even when TLS ends at
// a proxy. Only use them to strengthen cookies, never to build redirect URLs.
export function secureRequestCookie(req?: Request): boolean {
  if (process.env.SECURE_COOKIES !== undefined)
    return process.env.SECURE_COOKIES === "true";
  if (!req) return false;
  if (req.secure) return true;
  try {
    const source = req.get("Origin") ?? req.get("Referer");
    if (!source) return false;
    const url = new URL(source);
    return url.protocol === "https:" && url.host === req.get("host");
  } catch {
    return false;
  }
}
