import crypto from "crypto";

/**
 * Character set for recovery keys.
 * Excludes ambiguous characters: 0/O, 1/I/L
 */
const RECOVERY_KEY_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generate a 28-character recovery key.
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX when shown; only its hash is stored
 * Uses uppercase alphanumeric, excluding similar chars (0/O, 1/I/L)
 */
export function generateRecoveryKey(): string {
  const bytes = crypto.randomBytes(28);
  let key = "";
  for (let i = 0; i < 28; i++) {
    const byteVal = bytes[i] ?? 0;
    key += RECOVERY_KEY_CHARS.charAt(byteVal % RECOVERY_KEY_CHARS.length);
  }
  return key;
}

/**
 * Format recovery key for display (add dashes every 4 characters).
 * @param key - The raw 28-character recovery key
 * @returns Formatted key like XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function formatRecoveryKey(key: string): string {
  return key.match(/.{1,4}/g)?.join("-") || key;
}

/**
 * Normalize recovery key for comparison (remove dashes, uppercase).
 * @param key - The user-entered recovery key (may have dashes, mixed case)
 * @returns Normalized key for database comparison
 */
export function normalizeRecoveryKey(key: string): string {
  return key.replace(/-/g, "").toUpperCase();
}

/**
 * The stored form of a recovery key: SHA-256 hex of the normalized key.
 * The key carries about 139 bits of entropy, so a fast hash is enough.
 */
export function hashRecoveryKey(key: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeRecoveryKey(key))
    .digest("hex");
}

/** Whether a user-entered key matches the stored hash (constant time). */
export function recoveryKeyMatches(input: string, storedHash: string): boolean {
  const actual = Buffer.from(hashRecoveryKey(input), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

/** Tells a stored hash from a plaintext key left by versions before 3.3.7. */
export function isRecoveryKeyHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
