import crypto from "crypto";

/**
 * Character set for recovery keys.
 * Excludes ambiguous characters: 0/O, 1/I/L
 */
const RECOVERY_KEY_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generate a 28-character recovery key.
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (without dashes in storage)
 * Uses uppercase alphanumeric, excluding similar chars (0/O, 1/I/L)
 */
export function generateRecoveryKey(): string {
  const bytes = crypto.randomBytes(28);
  let key = "";
  for (let i = 0; i < 28; i++) {
    key += RECOVERY_KEY_CHARS[bytes[i] % RECOVERY_KEY_CHARS.length];
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
