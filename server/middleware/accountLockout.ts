const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface FailedAttemptRecord {
  count: number;
  lockedUntil: number | null;
}

// In-memory tracking (resets on server restart)
let failedAttempts = new Map<string, FailedAttemptRecord>();

export interface LockoutCheckResult {
  locked: boolean;
  remainingMs?: number;
}

export const checkAccountLockout = (username: string): LockoutCheckResult => {
  const record = failedAttempts.get(username.toLowerCase());
  if (!record?.lockedUntil) return { locked: false };

  const now = Date.now();
  if (now < record.lockedUntil) {
    return { locked: true, remainingMs: record.lockedUntil - now };
  }

  // Lockout expired, clear it
  failedAttempts.delete(username.toLowerCase());
  return { locked: false };
};

export const recordFailedAttempt = (username: string): void => {
  const key = username.toLowerCase();
  const record = failedAttempts.get(key) || { count: 0, lockedUntil: null };
  record.count++;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  failedAttempts.set(key, record);
};

export const clearFailedAttempts = (username: string): void => {
  failedAttempts.delete(username.toLowerCase());
};

// For testing only - reset the in-memory store
export const _resetForTesting = (): void => {
  failedAttempts = new Map();
};
