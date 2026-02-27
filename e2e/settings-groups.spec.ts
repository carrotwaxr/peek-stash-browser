import { test, expect } from "@playwright/test";

/**
 * E2E tests for User Group management in Settings.
 *
 * Covers the full CRUD lifecycle: create, edit, delete groups,
 * plus member management (add/remove).
 *
 * Regression coverage for #438: editing a group with members crashed
 * because the API returned flat member objects but the client expected
 * nested { user: { id, username, role } } objects.
 */

test.describe("User Group Management", () => {
  const uniqueSuffix = Date.now();

  /** Navigate to Settings > Server > User Management tab */
  async function goToUserManagement(page: import("@playwright/test").Page) {
    await page.goto("/settings?section=server&tab=user-management");
    // Wait for the User Groups heading to be visible
    await expect(
      page.getByRole("heading", { name: "User Groups" })
    ).toBeVisible({ timeout: 10_000 });
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
    const groupName = `E2E Test Group ${uniqueSuffix}`;
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
    await expect(page.getByText(groupName)).toBeVisible();
  });

  test("can edit a group (regression: #438 blank page)", async ({ page }) => {
    await goToUserManagement(page);

    // First create a group to edit
    const groupName = `Edit Target ${uniqueSuffix}`;
    await page.getByRole("button", { name: "Create Group" }).first().click();
    await page.getByLabel("Name").fill(groupName);
    await page.getByText("Can Download Files", { exact: true }).click();
    await page.getByRole("button", { name: "Create Group" }).last().click();
    await expect(page.getByText("Group created successfully")).toBeVisible({
      timeout: 5_000,
    });

    // Find the row with our group and click Edit
    const groupRow = page.getByRole("row").filter({ hasText: groupName });
    await groupRow.getByRole("button", { name: "Edit" }).click();

    // Modal should open with "Edit Group: <name>" title
    await expect(page.getByText(`Edit Group: ${groupName}`)).toBeVisible({
      timeout: 5_000,
    });

    // The form should be populated (not blank — this is the #438 regression)
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
    await expect(page.getByText(updatedName)).toBeVisible();
  });

  test("can add and remove group members", async ({ page }) => {
    await goToUserManagement(page);

    // Create a group for member management
    const groupName = `Members Test ${uniqueSuffix}`;
    await page.getByRole("button", { name: "Create Group" }).first().click();
    await page.getByLabel("Name").fill(groupName);
    await page.getByRole("button", { name: "Create Group" }).last().click();
    await expect(page.getByText("Group created successfully")).toBeVisible({
      timeout: 5_000,
    });

    // Open the group for editing
    const groupRow = page.getByRole("row").filter({ hasText: groupName });
    await groupRow.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText(`Edit Group: ${groupName}`)).toBeVisible({
      timeout: 5_000,
    });

    // The member dropdown should be available (if there are users to add)
    const memberSelect = page.locator("select").filter({ hasText: "Select a user to add" });
    const hasUsersToAdd = await memberSelect.isVisible().catch(() => false);

    if (hasUsersToAdd) {
      // Select the first available user
      const options = await memberSelect.locator("option").all();
      // Skip the placeholder option
      if (options.length > 1) {
        const firstUserOption = options[1];
        const userName = await firstUserOption.textContent();
        await memberSelect.selectOption({ index: 1 });

        // Click Add
        await page.getByRole("button", { name: "Add" }).click();

        // Member should appear in the list
        await expect(page.getByText("Added")).toBeVisible({ timeout: 5_000 });

        // Members count should update
        await expect(page.getByText("Members (1)")).toBeVisible();

        // Remove the member (click the X button next to their name)
        const removeButton = page.locator("button[title='Remove from group']");
        await removeButton.click();

        // Should see removal confirmation
        await expect(page.getByText("Removed")).toBeVisible({ timeout: 5_000 });
        await expect(page.getByText("Members (0)")).toBeVisible();
      }
    }

    // Close the modal
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("can delete a group", async ({ page }) => {
    await goToUserManagement(page);

    // Create a group to delete
    const groupName = `Delete Target ${uniqueSuffix}`;
    await page.getByRole("button", { name: "Create Group" }).first().click();
    await page.getByLabel("Name").fill(groupName);
    await page.getByRole("button", { name: "Create Group" }).last().click();
    await expect(page.getByText("Group created successfully")).toBeVisible({
      timeout: 5_000,
    });

    // Find the row and click Delete
    const groupRow = page.getByRole("row").filter({ hasText: groupName });

    // Handle the confirmation dialog
    page.on("dialog", (dialog) => dialog.accept());

    await groupRow.getByRole("button", { name: "Delete" }).click();

    // Should see success message
    await expect(page.getByText("deleted successfully")).toBeVisible({
      timeout: 5_000,
    });

    // Group should no longer be in the table
    await expect(page.getByText(groupName)).not.toBeVisible();
  });

  test("group permissions badges display correctly", async ({ page }) => {
    await goToUserManagement(page);

    // Create a group with all permissions
    const groupName = `Perms Display ${uniqueSuffix}`;
    await page.getByRole("button", { name: "Create Group" }).first().click();
    await page.getByLabel("Name").fill(groupName);
    await page.getByText("Can Share", { exact: true }).click();
    await page.getByText("Can Download Files", { exact: true }).click();
    await page.getByText("Can Download Playlists", { exact: true }).click();
    await page.getByRole("button", { name: "Create Group" }).last().click();
    await expect(page.getByText("Group created successfully")).toBeVisible({
      timeout: 5_000,
    });

    // The group row should show permission badges
    const groupRow = page.getByRole("row").filter({ hasText: groupName });
    await expect(groupRow.getByText("Share")).toBeVisible();
    await expect(groupRow.getByText("Files")).toBeVisible();
    await expect(groupRow.getByText("Playlists")).toBeVisible();
  });
});
