import { test, expect } from "@playwright/test";

/**
 * E2E tests for entity detail pages.
 *
 * Covers navigation from list pages to detail pages, URL validation,
 * sidebar persistence, and graceful handling when no data exists.
 * Tests are resilient: they pass both with data (dev) and without data (CI fresh DB).
 */

test.describe("Detail Pages", () => {
  test("performer detail page loads from list", async ({ page }) => {
    await page.goto("/performers");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const performerLink = page.locator('a[href*="/performer/"]').first();
    const hasPerformers = await performerLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasPerformers) {
      await performerLink.click();
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain("/performer/");
    }
    // If no performers, test passes gracefully
  });

  test("studio detail page loads from list", async ({ page }) => {
    await page.goto("/studios");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const studioLink = page.locator('a[href*="/studio/"]').first();
    const hasStudios = await studioLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasStudios) {
      await studioLink.click();
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain("/studio/");
    }
  });

  test("tag detail page loads from list", async ({ page }) => {
    await page.goto("/tags");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const tagLink = page.locator('a[href*="/tag/"]').first();
    const hasTags = await tagLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasTags) {
      await tagLink.click();
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain("/tag/");
    }
  });

  test("gallery detail page loads from list", async ({ page }) => {
    await page.goto("/galleries");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const galleryLink = page.locator('a[href*="/gallery/"]').first();
    const hasGalleries = await galleryLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasGalleries) {
      await galleryLink.click();
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain("/gallery/");
    }
  });

  test("collection detail page loads from list", async ({ page }) => {
    await page.goto("/collections");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const groupLink = page.locator('a[href*="/collection/"]').first();
    const hasGroups = await groupLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasGroups) {
      await groupLink.click();
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain("/collection/");
    }
  });

  test("detail pages show navigation sidebar", async ({ page }) => {
    await page.goto("/performers");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });

    const link = page.locator('a[href*="/performer/"]').first();
    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click();
      // Navigation should still be visible on detail page
      await expect(page.getByRole("navigation").first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("detail page URL contains entity ID", async ({ page }) => {
    await page.goto("/tags");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const tagLink = page.locator('a[href*="/tag/"]').first();
    if (await tagLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const href = await tagLink.getAttribute("href");
      await tagLink.click();
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible({ timeout: 10_000 });
      // URL should match the link href
      if (href) {
        expect(page.url()).toContain(href);
      }
    }
  });

  test("images page loads and shows content or empty state", async ({
    page,
  }) => {
    await page.goto("/images");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Images don't have detail pages via URL — they open lightbox
    // Just verify the page loads correctly
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("scene page loads from list when scenes exist", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const sceneLink = page.locator('a[href*="/scene/"]').first();
    const hasScenes = await sceneLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasScenes) {
      await sceneLink.click();
      await expect(page.getByRole("navigation").first()).toBeVisible({
        timeout: 10_000,
      });
      expect(page.url()).toContain("/scene/");
    }
  });

  test("direct navigation to detail pages shows content or error", async ({
    page,
  }) => {
    // These should not crash even with invalid IDs
    const detailPaths = [
      "/performer/1",
      "/studio/1",
      "/tag/1",
      "/gallery/1",
    ];

    for (const path of detailPaths) {
      await page.goto(path);
      // Should show navigation (app didn't crash)
      await expect(page.getByRole("navigation").first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
