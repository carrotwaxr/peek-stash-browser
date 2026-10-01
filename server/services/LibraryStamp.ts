/**
 * The library stamp: a short value every authenticated answer carries in
 * `X-Peek-Library` (set by `middleware/auth.ts`), so an open tab learns on
 * its next request that what it shows may have changed, and refetches.
 *
 * It is the process's boot id, a library counter and the user's own
 * counter, all in memory (a restart changes every stamp through the boot
 * id). `bumpLibrary` runs at the end of a sync's post-sync steps and after
 * a Stash server is added, edited, enabled, disabled or deleted;
 * `bumpUser` after an admin saves a user's restrictions or changes their
 * role. Each comes after the exclusion recompute, so the refetch it
 * triggers sees the new exclusions. The user's own hides and Content
 * Sources changes do not bump: the client already refetches after them.
 */

const bootId = Date.now().toString(36);
let library = 0;
const users = new Map<number, number>();

/** Something every user sees changed: a sync, or a Stash server change. */
export const bumpLibrary = (): void => {
  library += 1;
};

/** Something only this user sees changed: their restrictions or role. */
export const bumpUser = (userId: number): void => {
  users.set(userId, (users.get(userId) ?? 0) + 1);
};

/** Drops a deleted user's counter (invariant 6: nothing of theirs stays). */
export const forgetUser = (userId: number): void => {
  users.delete(userId);
};

/** The stamp the user's answers carry. */
export const libraryStampFor = (userId: number): string =>
  `${bootId}.${library}.${users.get(userId) ?? 0}`;
