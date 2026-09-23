import { type Page, expect, test } from "@playwright/test";

/**
 * E2E tests for the Content Restrictions editor in Settings (item 13).
 *
 * A user account gets two lists per type (Show only, Always hide) and an
 * "Also hide items with no X" box that is disabled until a list has an
 * item; an admin account gets no editor at all.
 *
 * Runs on both the populated dev database and the empty CI one: the Tags
 * search either lists options (pick them and save) or reports "No tags
 * found" (assert that and cancel).
 */

const PASSWORD = "E2eRestr1ctions!";

test.describe("Content Restrictions editor", () => {
  const uniqueSuffix = Date.now();
  const userName = `e2e-restr-user-${uniqueSuffix}`;
  const adminName = `e2e-restr-admin-${uniqueSuffix}`;
  const createdIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    // The request fixture carries the admin cookie from e2e/.auth/user.json
    for (const [username, role] of [
      [userName, "USER"],
      [adminName, "ADMIN"],
    ] as const) {
      const response = await request.post("/api/user/create", {
        data: { username, password: PASSWORD, role },
      });
      expect(response.ok(), `create ${username}`).toBeTruthy();
      const body = (await response.json()) as { user: { id: number } };
      createdIds.push(body.user.id);
    }
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      await request.delete(`/api/user/${id}`);
    }
  });

  /** Navigate to Settings > Server > User Management and open Edit for one user */
  async function openUserEditor(page: Page, username: string) {
    await page.goto("/settings?section=server&tab=user-management");
    await expect(
      page.getByRole("heading", { name: "User Groups" })
    ).toBeVisible({ timeout: 10_000 });
    const row = page.getByRole("row").filter({ hasText: username });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole("button", { name: "Edit" }).click();
  }

  /** The restrictions modal's own overlay (the innermost fixed layer with its subtitle) */
  function restrictionsModal(page: Page, username: string) {
    return page
      .locator("div.fixed")
      .filter({ hasText: `Configure content visibility for ${username}` })
      .last();
  }

  /** Open a SearchableSelect by its placeholder, type a query, wait for the debounced search */
  async function searchIn(page: Page, placeholder: string, query: string) {
    await page.getByText(placeholder, { exact: true }).click();
    const input = page.getByPlaceholder("Type to search...");
    await expect(input).toBeVisible();
    await input.fill(query);
    // 300 ms debounce plus the fetch
    await page.waitForTimeout(1_000);
    const dropdown = input.locator(
      "xpath=ancestor::div[contains(@class, 'absolute')]"
    );
    return { dropdown, noResults: dropdown.getByText("No tags found") };
  }

  test("user account: modal shows two lists per type and saves both", async ({
    page,
  }) => {
    await openUserEditor(page, userName);
    await page.getByRole("button", { name: "Manage Restrictions" }).click();

    await expect(
      page.getByText(`Configure content visibility for ${userName}`)
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("How Content Restrictions Work")).toBeVisible();

    // Collections, Tags, Studios, Galleries: two lists and a disabled box each
    await expect(page.getByText("Show only", { exact: true })).toHaveCount(4);
    await expect(page.getByText("Always hide", { exact: true })).toHaveCount(4);
    for (const label of ["collections", "tags", "studios", "galleries"]) {
      const box = page.getByRole("checkbox", {
        name: `Also hide items with no ${label}`,
      });
      await expect(box).toBeVisible();
      await expect(box).toBeDisabled();
    }

    const showOnly = await searchIn(page, "Show only these tags...", "a");
    const hasOptions = !(await showOnly.noResults
      .isVisible()
      .catch(() => false));

    if (!hasOptions) {
      // Empty CI database: nothing to pick
      await expect(showOnly.noResults).toBeVisible();
      // The restrictions modal's Cancel (the user editor has one too)
      await restrictionsModal(page, userName)
        .getByRole("button", { name: "Cancel" })
        .click();
      await expect(
        page.getByText(`Configure content visibility for ${userName}`)
      ).not.toBeVisible();
      return;
    }

    const firstOption = showOnly.dropdown.getByRole("button").first();
    const firstName = (await firstOption.textContent())?.trim() ?? "";
    expect(firstName).not.toBe("");
    await firstOption.click();

    // The box ticks itself with the first Show-only item
    const tagsBox = page.getByRole("checkbox", {
      name: "Also hide items with no tags",
    });
    await expect(tagsBox).toBeEnabled();
    await expect(tagsBox).toBeChecked();

    // Close the open dropdown (click outside) before opening the next one
    await page.getByText("How Content Restrictions Work").click();
    await expect(page.getByPlaceholder("Type to search...")).toHaveCount(0);

    const alwaysHide = await searchIn(page, "Always hide these tags...", "a");
    const options = alwaysHide.dropdown.getByRole("button");
    const count = await options.count();
    const secondOption = options.nth(count > 1 ? 1 : 0);
    const secondName = (await secondOption.textContent())?.trim() ?? "";
    await secondOption.click();

    await page.getByRole("button", { name: "Save Restrictions" }).click();
    await expect(
      page.getByText(`Content restrictions updated for ${userName}`)
    ).toBeVisible({ timeout: 10_000 });

    // Reopen: both chips are back and the box is still ticked
    await page.getByRole("button", { name: "Manage Restrictions" }).click();
    await expect(
      page.getByText(`Configure content visibility for ${userName}`)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: `Remove ${firstName}` })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: `Remove ${secondName}` }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Also hide items with no tags" })
    ).toBeChecked();
    await restrictionsModal(page, userName)
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(
      page.getByText(`Configure content visibility for ${userName}`)
    ).not.toBeVisible();
  });

  test("admin account: no restrictions editor", async ({ page }) => {
    await openUserEditor(page, adminName);

    await expect(
      page.getByText("Content restrictions do not apply to administrators.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Manage Restrictions" })
    ).toHaveCount(0);
  });
});
