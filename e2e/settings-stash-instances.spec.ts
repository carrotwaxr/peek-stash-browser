import { type APIRequestContext, expect, test } from "@playwright/test";
import { devStack } from "./support/env";

/**
 * E2E test for Settings → Server Configuration → Stash instances (item 24).
 *
 * Peek keeps one enabled instance: disabling the only one asks to confirm,
 * then the server refuses it with a message the page shows as a toast, the
 * instance stays enabled, and a reload opens Home, not the setup wizard.
 *
 * Hermetic only: on the dev stack a second enabled instance would really be
 * disabled. If the refusal ever fails, the test re-enables the instance, so
 * the specs running beside it keep their library.
 */

/** The part of GET /api/setup/stash-instances this test reads */
interface InstanceRow {
  id: string;
  name: string;
  enabled: boolean;
}

const REFUSAL =
  "Peek needs an enabled Stash instance. Add another instance first, or change this one's address under Edit.";

async function listInstances(
  request: APIRequestContext
): Promise<InstanceRow[]> {
  const response = await request.get("/api/setup/stash-instances");
  expect(response.ok(), "list the Stash instances").toBe(true);
  return ((await response.json()) as { instances: InstanceRow[] }).instances;
}

test.describe("Stash instances", () => {
  test.skip(
    devStack,
    "disables an instance: on the dev stack a second enabled one really goes"
  );

  test("the only enabled instance cannot be disabled, and a reload stays out of the setup wizard", async ({
    page,
  }) => {
    const instances = await listInstances(page.request);
    const enabled = instances.filter((row) => row.enabled);
    expect(enabled, "the hermetic run has one enabled instance").toHaveLength(
      1
    );
    const [instance] = enabled;
    if (!instance) throw new Error("no enabled Stash instance");

    try {
      await page.goto("/settings?section=server&tab=server-config");
      await expect(
        page.getByRole("heading", { name: instance.name, exact: true })
      ).toBeVisible({ timeout: 10_000 });

      const dialogs: string[] = [];
      page.once("dialog", (dialog) => {
        dialogs.push(dialog.message());
        void dialog.accept();
      });
      await page.getByRole("button", { name: "Disable", exact: true }).click();

      await expect(page.getByText(REFUSAL).first()).toBeVisible();
      expect(dialogs).toEqual([
        `Disable "${instance.name}"? Every user stops seeing its content until you enable it again. Ratings, history and playlists are kept.`,
      ]);
      // The list stays, the instance still enabled
      await expect(page.getByText("Active", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Disable", exact: true })
      ).toBeVisible();
      const after = await listInstances(page.request);
      expect(after.find((row) => row.id === instance.id)?.enabled).toBe(true);

      await page.goto("/");
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({
        timeout: 15_000,
      });
      expect(new URL(page.url()).pathname).not.toMatch(/^\/setup/);
    } finally {
      // A disable that went through would leave every other spec without a
      // library: put it back
      const now = await listInstances(page.request);
      if (now.find((row) => row.id === instance.id)?.enabled === false) {
        await page.request.put(`/api/setup/stash-instance/${instance.id}`, {
          data: { enabled: true },
        });
      }
    }
  });
});
