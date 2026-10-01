import { type Page, expect, test } from "@playwright/test";
import { deleteGroups } from "./support/cleanup";
import { runPrefix, uniqueName } from "./support/names";
import { type TestUser, createUser, deleteUser } from "./support/users";

/**
 * E2E tests for User Group management in Settings.
 *
 * Covers the full CRUD lifecycle: create, edit, delete groups,
 * plus member management (add/remove).
 *
 * Regression coverage for #438: editing a group with members crashed
 * because the API returned flat member objects but the client expected
 * nested { user: { id, username, role } } objects.
 *
 * Every group name goes through uniqueName; afterAll deletes the groups, and
 * the throwaway user the member test adds (a user of its own, so no other
 * spec's temporary user can vanish from the dropdown mid-test).
 */

/**
 * Every group here is named uniqueName("group"), which is
 * `<run prefix>-group-<worker>-<n>`: this is one worker's share of them
 */
const workerGroupPrefix = (workerIndex: number) =>
  `${runPrefix()}-group-${workerIndex}-`;

test.describe("User Group Management", () => {
  const createdUsers: TestUser[] = [];

  // Only this worker's groups: with fullyParallel, Playwright runs these
  // tests in groups on several workers at once, each group with its own
  // afterAll, so deleting every group of the run would pull them from under
  // tests still running elsewhere
  test.afterAll(async ({ request }, testInfo) => {
    for (const { id } of createdUsers.splice(0)) {
      await deleteUser(request, id);
    }
    await deleteGroups(request, workerGroupPrefix(testInfo.workerIndex));
  });

  /** Navigate to Settings > Server > User Management tab */
  async function goToUserManagement(page: Page) {
    await page.goto("/settings?section=server&tab=user-management");
    // Wait for the User Groups heading to be visible
    await expect(
      page.getByRole("heading", { name: "User Groups" })
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * The groups table's row for one group (only groups have Delete: a user's
   * row whose one group badge is this group has a cell of the same name)
   */
  const groupRow = (page: Page, name: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name, exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Delete" }) });

  /** The users table's row for one user */
  const userRow = (page: Page, username: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: username, exact: true }) });

  /** Creates a group through the Create Group modal */
  async function createGroup(
    page: Page,
    name: string,
    permissions: string[] = []
  ) {
    await page.getByRole("button", { name: "Create Group" }).first().click();
    await page.getByLabel("Name").fill(name);
    for (const permission of permissions) {
      await page.getByText(permission, { exact: true }).click();
    }
    await page.getByRole("button", { name: "Create Group" }).last().click();
    await expect(page.getByText("Group created successfully")).toBeVisible({
      timeout: 5_000,
    });
  }

  test("settings page loads User Management tab", async ({ page }) => {
    await goToUserManagement(page);
    await expect(page.getByText("Create and manage user groups")).toBeVisible();
  });

  test("can create a new group with permissions", async ({ page }) => {
    await goToUserManagement(page);

    // Click "Create Group" button
    await page.getByRole("button", { name: "Create Group" }).first().click();

    // Modal should appear
    await expect(page.getByText("Create Group").last()).toBeVisible();

    // Fill in group details
    const groupName = uniqueName("group");
    await page.getByLabel("Name").fill(groupName);
    await page.getByLabel("Description").fill("Created by E2E test");

    // Enable "Can Share" permission
    await page.getByText("Can Share", { exact: true }).click();

    // Submit
    await page.getByRole("button", { name: "Create Group" }).last().click();

    // Modal should close and success message should appear
    await expect(page.getByText("Group created successfully")).toBeVisible({
      timeout: 5_000,
    });

    // Group should appear in the table
    await expect(groupRow(page, groupName)).toBeVisible();
  });

  test("can edit a group (regression: #438 blank page)", async ({ page }) => {
    await goToUserManagement(page);

    // First create a group to edit
    const groupName = uniqueName("group");
    await createGroup(page, groupName, ["Can Download Files"]);

    // Find the row with our group and click Edit
    await groupRow(page, groupName)
      .getByRole("button", { name: "Edit" })
      .click();

    // Modal should open with "Edit Group: <name>" title
    await expect(page.getByText(`Edit Group: ${groupName}`)).toBeVisible({
      timeout: 5_000,
    });

    // The form should be populated (not blank: the #438 regression)
    const nameInput = page.getByLabel("Name");
    await expect(nameInput).toHaveValue(groupName);

    // The Members section should be visible in edit mode
    await expect(page.getByText("Members (0)")).toBeVisible();

    // Update the name
    const updatedName = `${groupName} Updated`;
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Should see success message and updated name in table
    await expect(page.getByText("Group updated successfully")).toBeVisible({
      timeout: 5_000,
    });
    await expect(groupRow(page, updatedName)).toBeVisible();
  });

  test("can add and remove group members", async ({ page, request }) => {
    // A member of this test's own, created before the page lists the users
    const member = await createUser(request, "member");
    createdUsers.push(member);
    await goToUserManagement(page);

    // Create a group for member management
    const groupName = uniqueName("group");
    await createGroup(page, groupName);

    // Open the group for editing
    await groupRow(page, groupName)
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(page.getByText(`Edit Group: ${groupName}`)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Members (0)")).toBeVisible();

    // Add the member
    const memberSelect = page
      .locator("select")
      .filter({ hasText: "Select a user to add" });
    await expect(memberSelect).toBeVisible();
    await memberSelect.selectOption({ label: member.username });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByText(`Added ${member.username} to group`)
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Members (1)")).toBeVisible();

    // A member edit saves at once: Cancel closes and the tables update
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      groupRow(page, groupName).getByRole("cell", { name: "1", exact: true })
    ).toBeVisible({ timeout: 5_000 });
    await expect(userRow(page, member.username)).toContainText(groupName);

    // Remove the member (the X button next to their name)
    await groupRow(page, groupName)
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(page.getByText("Members (1)")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator("button[title='Remove from group']").click();
    await expect(
      page.getByText(`Removed ${member.username} from group`)
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Members (0)")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      groupRow(page, groupName).getByRole("cell", { name: "0", exact: true })
    ).toBeVisible({ timeout: 5_000 });
    await expect(userRow(page, member.username)).not.toContainText(groupName);
  });

  test("can delete a group", async ({ page }) => {
    await goToUserManagement(page);

    // Create a group to delete
    const groupName = uniqueName("group");
    await createGroup(page, groupName);

    await groupRow(page, groupName)
      .getByRole("button", { name: "Delete" })
      .click();

    // Peek's confirmation dialog, not the browser's
    const confirm = page.getByRole("dialog", { name: "Delete group?" });
    await expect(confirm).toContainText(`Delete the group "${groupName}"?`);
    await confirm.getByRole("button", { name: "Delete group" }).click();

    // Should see success message
    await expect(
      page.getByText(`Group "${groupName}" deleted successfully`)
    ).toBeVisible({ timeout: 5_000 });

    // Group should no longer be in the table
    await expect(groupRow(page, groupName)).toHaveCount(0);
  });

  test("group permissions badges display correctly", async ({ page }) => {
    await goToUserManagement(page);

    // Create a group with all permissions
    const groupName = uniqueName("group");
    await createGroup(page, groupName, [
      "Can Share",
      "Can Download Files",
      "Can Download Playlists",
    ]);

    // The group row should show permission badges
    const row = groupRow(page, groupName);
    await expect(row.getByText("Share")).toBeVisible();
    await expect(row.getByText("Files")).toBeVisible();
    await expect(row.getByText("Playlists")).toBeVisible();
  });
});
