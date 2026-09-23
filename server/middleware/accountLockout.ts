import { ipKeyGenerator } from "express-rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
// The address multiplies the keys, so stale records are dropped past this
const MAX_TRACKED_RECORDS = 10_000;

interface FailedAttemptRecord {
  count: number;
  lockedUntil: number | null;
  lastFailureAt: number;
}

// In-memory tracking (resets on server restart), keyed per username and
// client address, so failures from one address never lock out another
let failedAttempts = new Map<string, FailedAttemptRecord>();

export interface LockoutCheckResult {
  locked: boolean;
  remainingMs?: number;
}

/** IPv4-mapped IPv6 as plain IPv4, then IPv6 grouped by /56 as the rate limiter does */
const clientKey = (ip: string): string =>
  ipKeyGenerator(ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1"));

const lockoutKey = (username: string, ip: string): string =>
  `${username.toLowerCase()}\0${clientKey(ip)}`;

const isStale = (record: FailedAttemptRecord, now: number): boolean =>
  (record.lockedUntil === null || record.lockedUntil <= now) &&
  now - record.lastFailureAt > LOCKOUT_DURATION_MS;

const dropStaleRecords = (now: number): void => {
  for (const [key, record] of failedAttempts) {
    if (isStale(record, now)) failedAttempts.delete(key);
  }
};

export const checkAccountLockout = (
  username: string,
  ip: string
): LockoutCheckResult => {
  const key = lockoutKey(username, ip);
  const record = failedAttempts.get(key);
  if (!record?.lockedUntil) return { locked: false };

  const now = Date.now();
  if (now < record.lockedUntil) {
    return { locked: true, remainingMs: record.lockedUntil - now };
  }

  // Lockout expired, clear it
  failedAttempts.delete(key);
  return { locked: false };
};

export const recordFailedAttempt = (username: string, ip: string): void => {
  const key = lockoutKey(username, ip);
  const now = Date.now();

  if (failedAttempts.size >= MAX_TRACKED_RECORDS) {
    dropStaleRecords(now);
  }

  // A failure more than LOCKOUT_DURATION_MS after the previous one starts over
  const existing = failedAttempts.get(key);
  const record: FailedAttemptRecord =
    existing && now - existing.lastFailureAt <= LOCKOUT_DURATION_MS
      ? existing
      : { count: 0, lockedUntil: null, lastFailureAt: now };
  record.count++;
  record.lastFailureAt = now;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  failedAttempts.set(key, record);
};

export const clearFailedAttempts = (username: string, ip: string): void => {
  failedAttempts.delete(lockoutKey(username, ip));
};

// For testing only - reset the in-memory store
export const _resetForTesting = (): void => {
  failedAttempts = new Map();
};

// For testing only - how many username and address pairs are tracked
export const _trackedCountForTesting = (): number => failedAttempts.size;
