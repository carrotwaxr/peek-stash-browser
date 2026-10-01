import { type Locator, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";

/**
 * The player's queue follows the router (item 47): a step replaces the
 * history entry with the next scene and the queue in its state, so a reload
 * keeps the place and one Back leaves for the page the queue started from.
 */

const titleLinkOf = (card: Locator) => card.locator("a:has(.card-title)");

test("a grid queue survives Up Next, a reload and Back", async ({ page }) => {
  const list = new ListPage(page);
  await list.goto("/scenes");
  const count = await list.waitForResults("Scene");
  requireData(count >= 2 ? count : undefined, "two scenes");
  const cards = list.cards("Scene");
  const secondHref = requireData(
    await titleLinkOf(cards.nth(1)).getAttribute("href"),
    "a link on the second scene card"
  );
  const secondPath = new URL(secondHref, "http://peek.invalid").pathname;

  await titleLinkOf(cards.first()).click();
  await expect(page).toHaveURL(/\/scene\//);
  const sidebar = page.locator("aside");
  await expect(sidebar.getByText("Browsing", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const upNext = sidebar
    .getByText("Up Next", { exact: true })
    .locator("..")
    .locator("h4");
  const nextTitle = (await upNext.innerText()).trim();
  await upNext.click();

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe(secondPath);
  const heading = page.locator("h1");
  await expect(heading).toHaveText(nextTitle, { timeout: 15_000 });
  const position = sidebar.getByText(new RegExp(`^2 / ${String(count)}$`));
  await expect(position).toBeVisible();

  await page.reload();

  await expect(heading).toHaveText(nextTitle, { timeout: 15_000 });
  await expect(position).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(secondPath);

  await page.goBack();
  await expect(page).toHaveURL(/\/scenes$/);

  // Opened later on its own (a new load, no queue handed over), the scene
  // plays alone: the old queue does not come back
  await page.goto(secondHref);
  await expect(heading).toHaveText(nextTitle, { timeout: 15_000 });
  await expect(sidebar.getByText("Browsing", { exact: true })).toHaveCount(0);
});

test("Next scene pressed from the keyboard moves focus into the new scene's player", async ({
  page,
}) => {
  // Below lg the queue's card holds Previous and Next under the player
  await page.setViewportSize({ width: 390, height: 844 });
  const list = new ListPage(page);
  await list.goto("/scenes");
  const count = await list.waitForResults("Scene");
  requireData(count >= 2 ? count : undefined, "two scenes");
  const cards = list.cards("Scene");
  const secondHref = requireData(
    await titleLinkOf(cards.nth(1)).getAttribute("href"),
    "a link on the second scene card"
  );
  const secondPath = new URL(secondHref, "http://peek.invalid").pathname;

  await titleLinkOf(cards.first()).click();
  await expect(page).toHaveURL(/\/scene\//);
  const next = page.getByRole("button", { name: "Next scene" }).first();
  await expect(next).toBeEnabled({ timeout: 15_000 });

  // The button stays on the page while the next scene loads
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe(secondPath);

  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.activeElement?.closest(".video-js") !== null
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
});
