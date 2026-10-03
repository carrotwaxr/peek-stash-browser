import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Helpers for the row editor, which the Advanced view and the carousel
 * builder share. A row's controls carry ids built from the row's id
 * (`filter-<rowId>-field`, `-condition`, `-actions`; the value control has
 * `filter-<rowId>`), so a row is found by the id of the field select that
 * appeared when it was added.
 */

/** One row's controls */
export interface RowHandle {
  /** The row's field select ("Filter") */
  field: Locator;
  /** The row's condition select ("Has ALL of these") */
  condition: Locator;
  /** The value control's first element: a picker's trigger, a text input */
  value: Locator;
  /** The "Row actions for <field>" button */
  actions: Locator;
}

/** A container's name in the waiting row's label: "top level" or "Group 1" */
export type RowContainer = "top level" | `Group ${number}`;

const byId = (scope: Locator, id: string) => scope.locator(`[id="${id}"]`);

/** The controls of the row whose field select has this id */
export function rowOf(scope: Locator, fieldId: string): RowHandle {
  const rowId = fieldId.slice(0, -"-field".length);
  return {
    field: byId(scope, fieldId),
    condition: byId(scope, `${rowId}-condition`),
    value: byId(scope, rowId),
    actions: byId(scope, `${rowId}-actions`),
  };
}

const fieldIds = (scope: Locator) =>
  scope
    .locator('select[id$="-field"]')
    .evaluateAll((els) => els.map((el) => el.id));

/**
 * Picks `fieldLabel` in a container's waiting row ("Add a filter to ..."),
 * and returns the row that appeared. `scope` holds the whole editor (the
 * dialog, or the builder's page).
 */
export async function addRow(
  scope: Locator,
  container: RowContainer,
  fieldLabel: string
): Promise<RowHandle> {
  const before = await fieldIds(scope);
  await scope
    .getByLabel(`Add a filter to ${container}`, { exact: true })
    .selectOption({ label: fieldLabel });
  let added = "";
  await expect
    .poll(async () => {
      added = (await fieldIds(scope)).find((id) => !before.includes(id)) ?? "";
      return added;
    })
    .not.toBe("");
  return rowOf(scope, added);
}

/**
 * Picks the named entities in a row's picker, one search each, and closes
 * the list (Escape closes the list, not the dialog around it)
 */
export async function pickValues(
  page: Page,
  scope: Locator,
  row: RowHandle,
  names: readonly string[]
): Promise<void> {
  await row.value.click();
  const search = scope.getByPlaceholder("Type to search...");
  await expect(search).toBeVisible();
  for (const name of names) {
    await search.fill(name);
    await scope.getByRole("button", { name, exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);
}

/** A row's condition, by the words the select shows ("Has ANY of these") */
export async function setCondition(row: RowHandle, label: string) {
  await row.condition.selectOption({ label });
}
