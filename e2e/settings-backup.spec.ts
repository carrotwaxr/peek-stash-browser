import { expect, test } from "@playwright/test";

/**
 * E2E test for Settings → Backup (item 70).
 *
 * As the run admin: create a backup, see it listed with its kind and where
 * its file is on the data volume, delete it. There is no download: a backup
 * holds every user's password hash and history and the Stash API keys.
 */

/** The part of POST /api/admin/database/backup's answer this test reads. */
interface CreatedBackup {
  backup: { filename: string; kind: string; path: string };
}

test.describe("Database backups", () => {
  test("a backup is created, listed with its kind and path, and deleted", async ({
    page,
  }) => {
    await page.goto("/settings?section=server&tab=backup");
    await expect(
      page.getByRole("heading", { name: "Database Backup" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/password hash/)).toBeVisible();
    await expect(page.getByRole("button", { name: /download/i })).toHaveCount(
      0
    );

    const created = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/admin/database/backup") &&
        res.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Create Backup" }).click();
    const response = await created;
    expect(response.status()).toBe(200);
    const { backup } = (await response.json()) as CreatedBackup;
    expect(backup.kind).toBe("manual");

    const row = page.getByRole("listitem").filter({ hasText: backup.path });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText("Created in Peek")).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await row
      .getByRole("button", { name: `Delete backup ${backup.filename}` })
      .click();
    await expect(page.getByText("Backup deleted")).toBeVisible({
      timeout: 5_000,
    });
    await expect(row).toHaveCount(0);
  });
});
