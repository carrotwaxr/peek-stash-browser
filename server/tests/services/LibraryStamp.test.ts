/**
 * The library stamp: an in-memory value per user that every authenticated
 * answer carries (X-Peek-Library), so an open tab learns that a sync or an
 * admin's change landed. It is the process's boot id, a library counter
 * (sync, Stash server changes) and the user's own counter (restrictions,
 * role).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as LibraryStamp from "../../services/LibraryStamp.js";

type LibraryStampModule = typeof LibraryStamp;

/** The module as a fresh process loads it, booted at `now`. */
async function boot(now: number): Promise<LibraryStampModule> {
  vi.resetModules();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const stamp = await import("../../services/LibraryStamp.js");
  vi.mocked(Date.now).mockRestore();
  return stamp;
}

describe("LibraryStamp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a user's stamp changes after bumpLibrary and after bumpUser for that user, and not for another user's bump", async () => {
    const { bumpLibrary, bumpUser, libraryStampFor } = await boot(1_000);
    const first = libraryStampFor(1);

    bumpLibrary();
    const afterSync = libraryStampFor(1);
    expect(afterSync).not.toBe(first);

    bumpUser(1);
    const afterOwn = libraryStampFor(1);
    expect(afterOwn).not.toBe(afterSync);

    const otherBefore = libraryStampFor(2);
    bumpUser(2);
    expect(libraryStampFor(1)).toBe(afterOwn);
    expect(libraryStampFor(2)).not.toBe(otherBefore);
  });

  it("a restart changes every stamp", async () => {
    const before = await boot(1_000);
    const user = before.libraryStampFor(1);
    const fresh = before.libraryStampFor(99);

    const after = await boot(2_000);

    expect(after.libraryStampFor(1)).not.toBe(user);
    expect(after.libraryStampFor(99)).not.toBe(fresh);
  });

  it("a deleted user's entry is dropped", async () => {
    const { bumpUser, forgetUser, libraryStampFor } = await boot(1_000);
    const untouched = libraryStampFor(7);
    bumpUser(7);
    expect(libraryStampFor(7)).not.toBe(untouched);

    forgetUser(7);

    expect(libraryStampFor(7)).toBe(untouched);
  });
});
