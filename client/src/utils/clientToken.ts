/**
 * A random 128-bit token as 32 hex characters, for keys the client makes
 * (a play queue's identity). `crypto.randomUUID` exists only in secure
 * contexts, and Peek is commonly opened over plain HTTP on a LAN address;
 * `crypto.getRandomValues` works everywhere.
 */
export function newClientToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}
