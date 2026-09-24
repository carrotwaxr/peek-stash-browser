import { ipKeyGenerator } from "express-rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
// The address multiplies the keys, so the map is capped
const MAX_TRACKED_RECORDS = 10_000;
// A full map is trimmed to this, so the next scan waits for 1,000 new records
const TRIM_TO_RECORDS = MAX_TRACKED_RECORDS * 0.9;

interface FailedAttemptRecord {
  count: number;
  lockedUntil: number | null;
  lastFailureAt: number;
}

// In-memory tracking (resets on server restart), keyed per username and
// client address, so failures from one address never lock out another.
// recordFailedAttempt re-inserts a record on every failure, so the Map's
// order is the order of last failures, oldest first.
let failedAttempts = new Map<string, FailedAttemptRecord>();
let trimScans = 0;

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

const isLocked = (record: FailedAttemptRecord, now: number): boolean =>
  record.lockedUntil !== null && now < record.lockedUntil;

const dropStaleRecords = (now: number): void => {
  for (const [key, record] of failedAttempts) {
    if (isStale(record, now)) failedAttempts.delete(key);
  }
};

/**
 * Makes room in a full map by trimming it to 90%, so a flood of new
 * failures scans the map once per 1,000 records rather than on every call.
 * Stale records go first, then unlocked ones, oldest failure first: a flood
 * of fresh failures must not evict the lock on the account it is guessing.
 * Locks go only once every record left is locked, oldest lock first.
 */
const trimRecords = (now: number): void => {
  trimScans++;
  dropStaleRecords(now);
  if (failedAttempts.size <= TRIM_TO_RECORDS) return;

  for (const [key, record] of failedAttempts) {
    if (isLocked(record, now)) continue;
    failedAttempts.delete(key);
    if (failedAttempts.size <= TRIM_TO_RECORDS) return;
  }

  // Every record left is locked, and a lock starts at its last failure
  for (const key of failedAttempts.keys()) {
    failedAttempts.delete(key);
    if (failedAttempts.size <= TRIM_TO_RECORDS) return;
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

  // Only a new record grows the map
  const existing = failedAttempts.get(key);
  if (!existing && failedAttempts.size >= MAX_TRACKED_RECORDS) {
    trimRecords(now);
  }

  // A failure more than LOCKOUT_DURATION_MS after the previous one starts over
  const record: FailedAttemptRecord =
    existing && now - existing.lastFailureAt <= LOCKOUT_DURATION_MS
      ? existing
      : { count: 0, lockedUntil: null, lastFailureAt: now };
  record.count++;
  record.lastFailureAt = now;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  // Re-insert, so the record moves to the newest end of the Map's order
  failedAttempts.delete(key);
  failedAttempts.set(key, record);
};

export const clearFailedAttempts = (username: string, ip: string): void => {
  failedAttempts.delete(lockoutKey(username, ip));
};

// For testing only - reset the in-memory store
export const _resetForTesting = (): void => {
  failedAttempts = new Map();
  trimScans = 0;
};

// For testing only - how many username and address pairs are tracked
export const _trackedCountForTesting = (): number => failedAttempts.size;

// For testing only - how many times a full map has been scanned and trimmed
export const _trimScansForTesting = (): number => trimScans;
