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

test("the queue sidebar is as tall as the player and its controls, and scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const list = new ListPage(page);
  await list.goto("/scenes");
  const count = await list.waitForResults("Scene");
  // Enough items that the full list is taller than the player column
  requireData(count >= 8 ? count : undefined, "eight scenes");

  await titleLinkOf(list.cards("Scene").first()).click();
  await expect(page).toHaveURL(/\/scene\//);
  const sidebar = page.locator("aside div.sticky > div").first();
  await expect(sidebar.getByText("Browsing", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // The player column's content: the video's top to the controls' bottom
  const column = page.locator("main > div.grid > div").first();
  const columnContent = () =>
    column.evaluate((el) => {
      const kids = Array.from(el.children) as HTMLElement[];
      const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
      const bottom = Math.max(
        ...kids.map((k) => k.getBoundingClientRect().bottom)
      );
      return bottom - top;
    });

  await expect
    .poll(async () => {
      const box = await sidebar.boundingBox();
      return Math.abs((box?.height ?? 0) - (await columnContent()));
    })
    .toBeLessThan(2);
  // The column does not stretch past its content (no gap above Details)
  const columnBox = await column.boundingBox();
  expect(
    Math.abs((columnBox?.height ?? 0) - (await columnContent()))
  ).toBeLessThan(2);
  // The list scrolls inside the sidebar instead of growing it
  const scroller = sidebar.locator(".overflow-y-auto");
  expect(
    await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)
  ).toBe(true);
});
