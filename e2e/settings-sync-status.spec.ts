import { expect, test } from "@playwright/test";
import { requireData } from "./support/data";

/**
 * E2E test for Settings → Server Configuration → Sync status (item 20).
 *
 * As the run admin: the status block lists the instance global setup synced,
 * one row per entity type with its last full sync and no problem, and Full
 * Sync asks first; cancelling sends nothing.
 *
 * It never starts a sync: a Full Sync while other specs run would recompute
 * every user's exclusions under them. Abort, the 409 and Apply deletions are
 * covered by the client unit tests.
 */

/** The part of GET /api/sync/status this test reads */
interface SyncStatus {
  instances: Array<{ name: string; enabled: boolean }>;
}

const TYPE_ROWS = [
  "Tags",
  "Studios",
  "Performers",
  "Collections",
  "Galleries",
  "Scenes",
  "Clips",
  "Images",
];

test.describe("Sync status", () => {
  test("lists each type's last sync, and Full Sync asks before it starts", async ({
    page,
  }) => {
    const refreshes: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/stats/refresh-cache")
      ) {
        refreshes.push(request.url());
      }
    });

    const status = await page.request.get("/api/sync/status");
    expect(status.ok()).toBe(true);
    const { instances } = (await status.json()) as SyncStatus;
    const instance = requireData(
      instances.find((i) => i.enabled),
      "an enabled Stash instance"
    );

    await page.goto("/settings?section=server&tab=server-config");
    await expect(
      page.getByRole("heading", { name: "Sync status" })
    ).toBeVisible({ timeout: 10_000 });

    const table = page.getByRole("table", { name: instance.name });
    await expect(table).toBeVisible();
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(TYPE_ROWS.length);
    for (const [index, label] of TYPE_ROWS.entries()) {
      const cells = rows.nth(index).getByRole("cell");
      await expect(cells.nth(0)).toHaveText(label);
      // The startup sync's time, not "Never"
      await expect(cells.nth(1)).not.toHaveText("Never");
      await expect(cells.nth(1)).toHaveText(/\d/);
      // No problem stored
      await expect(cells.nth(4)).toHaveText("");
    }

    await page.getByRole("button", { name: "Full Sync" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("every item from every Stash");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    expect(refreshes).toEqual([]);
  });
});
