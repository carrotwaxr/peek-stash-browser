/**
 * Unit Tests for Custom Theme Controller
 *
 * Tests all 6 endpoints: getUserCustomThemes, getCustomTheme, createCustomTheme,
 * updateCustomTheme, deleteCustomTheme, duplicateCustomTheme. Covers auth,
 * validation (name length, hex colors, ThemeConfig structure), conflict detection,
 * not-found, happy paths, and error handling.
 */
import type { CustomTheme } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCustomTheme,
  deleteCustomTheme,
  duplicateCustomTheme,
  getCustomTheme,
  getUserCustomThemes,
  updateCustomTheme,
} from "../../controllers/customTheme.js";
import prisma from "../../prisma/singleton.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { objectContaining } from "../helpers/matchers.js";

// Mock prisma — BEFORE imports
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

const USER = { id: 1, username: "testuser", role: "USER" };

type ThemeConfig = {
  mode: "dark" | "light";
  fonts: { brand: string; heading: string; body: string; mono: string };
  colors: {
    background: string;
    backgroundSecondary: string;
    backgroundCard: string;
    text: string;
    border: string;
  };
  accents: { primary: string; secondary: string };
  status: { success: string; error: string; info: string; warning: string };
};

function validThemeConfig(): ThemeConfig {
  return {
    mode: "dark",
    fonts: {
      brand: "Inter",
      heading: "Inter",
      body: "Inter",
      mono: "Fira Code",
    },
    colors: {
      background: "#1a1a2e",
      backgroundSecondary: "#16213e",
      backgroundCard: "#0f3460",
      text: "#e6e6e6",
      border: "#333333",
    },
    accents: { primary: "#e94560", secondary: "#533483" },
    status: {
      success: "#00b894",
      error: "#d63031",
      info: "#0984e3",
      warning: "#fdcb6e",
    },
  };
}

/** Factory for a stored theme row */
function themeRow(overrides: Partial<CustomTheme> = {}): CustomTheme {
  return {
    id: 1,
    userId: USER.id,
    name: "My Theme",
    config: validThemeConfig(),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("Custom Theme Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getUserCustomThemes ──────────────────────────────────────────────

  describe("getUserCustomThemes", () => {
    it("returns 401 when no user", async () => {
      const req = reqFor(getUserCustomThemes);
      const res = resFor(getUserCustomThemes);
      await getUserCustomThemes(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns themes array on success", async () => {
      const themes = [themeRow(), themeRow({ id: 2, name: "Second Theme" })];
      mockPrisma.customTheme.findMany.mockResolvedValue(themes);

      const req = reqFor(getUserCustomThemes, { user: USER });
      const res = resFor(getUserCustomThemes);
      await getUserCustomThemes(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual({ themes });
      expect(mockPrisma.customTheme.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER.id } })
      );
    });

    it("returns 500 on database error", async () => {
      mockPrisma.customTheme.findMany.mockRejectedValue(new Error("DB fail"));

      const req = reqFor(getUserCustomThemes, { user: USER });
      const res = resFor(getUserCustomThemes);
      await getUserCustomThemes(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── getCustomTheme ───────────────────────────────────────────────────

  describe("getCustomTheme", () => {
    it("returns 401 when no user", async () => {
      const req = reqFor(getCustomTheme, { params: { id: "1" } });
      const res = resFor(getCustomTheme);
      await getCustomTheme(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid (non-numeric) ID", async () => {
      const req = reqFor(getCustomTheme, { params: { id: "abc" }, user: USER });
      const res = resFor(getCustomTheme);
      await getCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme ID" })
      );
    });

    it("returns 404 when theme not found", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(null);

      const req = reqFor(getCustomTheme, { params: { id: "999" }, user: USER });
      const res = resFor(getCustomTheme);
      await getCustomTheme(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("returns theme on success", async () => {
      const theme = themeRow();
      mockPrisma.customTheme.findFirst.mockResolvedValue(theme);

      const req = reqFor(getCustomTheme, { params: { id: "1" }, user: USER });
      const res = resFor(getCustomTheme);
      await getCustomTheme(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(expect.objectContaining({ theme }));
    });

    it("returns 500 on database error", async () => {
      mockPrisma.customTheme.findFirst.mockRejectedValue(new Error("DB fail"));

      const req = reqFor(getCustomTheme, { params: { id: "1" }, user: USER });
      const res = resFor(getCustomTheme);
      await getCustomTheme(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── createCustomTheme ────────────────────────────────────────────────

  describe("createCustomTheme", () => {
    it("returns 401 when no user", async () => {
      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config: validThemeConfig() },
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when name is missing", async () => {
      const req = reqFor(createCustomTheme, {
        body: malformed({ config: validThemeConfig() }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Theme name is required" })
      );
    });

    it("returns 400 when name is empty string", async () => {
      const req = reqFor(createCustomTheme, {
        body: { name: "", config: validThemeConfig() },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Theme name is required" })
      );
    });

    it("returns 400 when name exceeds 50 characters", async () => {
      const longName = "A".repeat(51);
      const req = reqFor(createCustomTheme, {
        body: { name: longName, config: validThemeConfig() },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({
          error: "Theme name must be 50 characters or less",
        })
      );
    });

    // ── validateThemeConfig failure modes ──

    it("returns 400 for null config", async () => {
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config: null }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 for undefined config", async () => {
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test" }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 for invalid mode", async () => {
      const config = { ...validThemeConfig(), mode: "neon" };
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 when fonts object is missing", async () => {
      const { fonts: _fonts, ...config } = validThemeConfig();
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 when a required font key is missing", async () => {
      const { brand: _brand, ...fonts } = validThemeConfig().fonts;
      const config = { ...validThemeConfig(), fonts };
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 when colors object is missing", async () => {
      const { colors: _colors, ...config } = validThemeConfig();
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 for invalid hex color in colors", async () => {
      const config = validThemeConfig();
      config.colors.background = "#xyz123";
      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 for short hex color (not 6 digits)", async () => {
      const config = validThemeConfig();
      config.colors.background = "#1234";
      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for named color instead of hex", async () => {
      const config = validThemeConfig();
      config.colors.text = "red";
      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when accents object is missing", async () => {
      const { accents: _accents, ...config } = validThemeConfig();
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("returns 400 for invalid accent colors", async () => {
      const config = validThemeConfig();
      config.accents.primary = "notahex";
      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when status object is missing", async () => {
      const { status: _status, ...config } = validThemeConfig();
      const req = reqFor(createCustomTheme, {
        body: malformed({ name: "Test", config }),
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid status colors", async () => {
      const config = validThemeConfig();
      config.status.error = "#GGG000";
      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
    });

    // ── duplicate name ──

    it("returns 409 when theme name already exists", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(themeRow());

      const req = reqFor(createCustomTheme, {
        body: { name: "My Theme", config: validThemeConfig() },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(409);
      expect(res._getBody()).toEqual(
        expect.objectContaining({
          error: "A theme with this name already exists",
        })
      );
    });

    // ── happy path ──

    it("creates theme and returns 201", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(null);
      const created = themeRow({ name: "New Theme" });
      mockPrisma.customTheme.create.mockResolvedValue(created);

      const req = reqFor(createCustomTheme, {
        body: { name: "New Theme", config: validThemeConfig() },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(201);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ theme: created })
      );
    });

    it("returns 500 on database error", async () => {
      mockPrisma.customTheme.findFirst.mockRejectedValue(new Error("DB fail"));

      const req = reqFor(createCustomTheme, {
        body: { name: "Test", config: validThemeConfig() },
        user: USER,
      });
      const res = resFor(createCustomTheme);
      await createCustomTheme(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── updateCustomTheme ────────────────────────────────────────────────

  describe("updateCustomTheme", () => {
    it("returns 401 when no user", async () => {
      const req = reqFor(updateCustomTheme, {
        body: { name: "Updated" },
        params: { id: "1" },
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid ID", async () => {
      const req = reqFor(updateCustomTheme, {
        body: { name: "Updated" },
        params: { id: "abc" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme ID" })
      );
    });

    it("returns 404 when theme not found", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(null);

      const req = reqFor(updateCustomTheme, {
        body: { name: "Updated" },
        params: { id: "999" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("returns 400 when name is empty string", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(themeRow());

      const req = reqFor(updateCustomTheme, {
        body: { name: "" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Theme name cannot be empty" })
      );
    });

    it("returns 400 when name exceeds 50 characters", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(themeRow());

      const longName = "B".repeat(51);
      const req = reqFor(updateCustomTheme, {
        body: { name: longName },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({
          error: "Theme name must be 50 characters or less",
        })
      );
    });

    it("returns 409 when updated name conflicts with another theme", async () => {
      // First findFirst returns the current theme (exists check)
      // Second findFirst returns a different theme with the same name (duplicate check)
      mockPrisma.customTheme.findFirst
        .mockResolvedValueOnce(themeRow({ id: 1 }))
        .mockResolvedValueOnce(themeRow({ id: 2, name: "Taken Name" }));

      const req = reqFor(updateCustomTheme, {
        body: { name: "Taken Name" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(409);
    });

    it("returns 400 for invalid config", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(themeRow());

      const config = { ...validThemeConfig(), mode: "invalid" };
      const req = reqFor(updateCustomTheme, {
        body: malformed({ config }),
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme configuration" })
      );
    });

    it("updates name only", async () => {
      const existing = themeRow();
      mockPrisma.customTheme.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null); // no duplicate
      const updated = themeRow({ name: "Renamed" });
      mockPrisma.customTheme.update.mockResolvedValue(updated);

      const req = reqFor(updateCustomTheme, {
        body: { name: "Renamed" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ theme: updated })
      );
    });

    it("updates config only", async () => {
      const existing = themeRow();
      mockPrisma.customTheme.findFirst.mockResolvedValue(existing);
      const newConfig = validThemeConfig();
      newConfig.mode = "light";
      const updated = themeRow({ config: newConfig });
      mockPrisma.customTheme.update.mockResolvedValue(updated);

      const req = reqFor(updateCustomTheme, {
        body: { config: newConfig },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ theme: updated })
      );
    });

    it("updates both name and config", async () => {
      const existing = themeRow();
      mockPrisma.customTheme.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null); // no duplicate
      const newConfig = validThemeConfig();
      newConfig.mode = "light";
      const updated = themeRow({ name: "New Name", config: newConfig });
      mockPrisma.customTheme.update.mockResolvedValue(updated);

      const req = reqFor(updateCustomTheme, {
        body: { name: "New Name", config: newConfig },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ theme: updated })
      );
    });

    it("returns 500 on database error", async () => {
      mockPrisma.customTheme.findFirst.mockRejectedValue(new Error("DB fail"));

      const req = reqFor(updateCustomTheme, {
        body: { name: "Test" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCustomTheme);
      await updateCustomTheme(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── deleteCustomTheme ────────────────────────────────────────────────

  describe("deleteCustomTheme", () => {
    it("returns 401 when no user", async () => {
      const req = reqFor(deleteCustomTheme, { params: { id: "1" } });
      const res = resFor(deleteCustomTheme);
      await deleteCustomTheme(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid ID", async () => {
      const req = reqFor(deleteCustomTheme, {
        params: { id: "abc" },
        user: USER,
      });
      const res = resFor(deleteCustomTheme);
      await deleteCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme ID" })
      );
    });

    it("returns 404 when theme not found", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(null);

      const req = reqFor(deleteCustomTheme, {
        params: { id: "999" },
        user: USER,
      });
      const res = resFor(deleteCustomTheme);
      await deleteCustomTheme(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("deletes theme and returns success", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(themeRow());
      mockPrisma.customTheme.delete.mockResolvedValue(themeRow());

      const req = reqFor(deleteCustomTheme, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(deleteCustomTheme);
      await deleteCustomTheme(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ success: true })
      );
    });

    it("returns 500 on database error", async () => {
      mockPrisma.customTheme.findFirst.mockRejectedValue(new Error("DB fail"));

      const req = reqFor(deleteCustomTheme, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(deleteCustomTheme);
      await deleteCustomTheme(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── duplicateCustomTheme ─────────────────────────────────────────────

  describe("duplicateCustomTheme", () => {
    it("returns 401 when no user", async () => {
      const req = reqFor(duplicateCustomTheme, { params: { id: "1" } });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid ID", async () => {
      const req = reqFor(duplicateCustomTheme, {
        params: { id: "abc" },
        user: USER,
      });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ error: "Invalid theme ID" })
      );
    });

    it("returns 404 when source theme not found", async () => {
      mockPrisma.customTheme.findFirst.mockResolvedValue(null);

      const req = reqFor(duplicateCustomTheme, {
        params: { id: "999" },
        user: USER,
      });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("duplicates theme with '(Copy)' suffix", async () => {
      const original = themeRow({ name: "Cyberpunk" });
      // 1st findFirst: ownership check returns original
      // 2nd findFirst: while-loop name collision check returns null (no collision)
      mockPrisma.customTheme.findFirst
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(null);
      const duplicated = themeRow({ id: 2, name: "Cyberpunk (Copy)" });
      mockPrisma.customTheme.create.mockResolvedValue(duplicated);

      const req = reqFor(duplicateCustomTheme, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);

      expect(res._getStatus()).toBe(201);
      expect(res._getBody()).toEqual(
        expect.objectContaining({ theme: duplicated })
      );
      expect(mockPrisma.customTheme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ name: "Cyberpunk (Copy)" }),
        })
      );
    });

    it("appends '(Copy 2)' when '(Copy)' already exists", async () => {
      const original = themeRow({ name: "Cyberpunk" });
      // 1st findFirst: ownership check
      // 2nd findFirst: "(Copy)" exists → collision
      // 3rd findFirst: "(Copy 2)" doesn't exist → null
      mockPrisma.customTheme.findFirst
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(themeRow({ id: 2, name: "Cyberpunk (Copy)" }))
        .mockResolvedValueOnce(null);
      const duplicated = themeRow({ id: 3, name: "Cyberpunk (Copy 2)" });
      mockPrisma.customTheme.create.mockResolvedValue(duplicated);

      const req = reqFor(duplicateCustomTheme, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.customTheme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ name: "Cyberpunk (Copy 2)" }),
        })
      );
    });

    it("appends '(Copy 3)' when '(Copy)' and '(Copy 2)' already exist", async () => {
      const original = themeRow({ name: "Cyberpunk" });
      // 1st findFirst: ownership check
      // 2nd findFirst: "(Copy)" exists → collision
      // 3rd findFirst: "(Copy 2)" exists → collision
      // 4th findFirst: "(Copy 3)" doesn't exist → null
      mockPrisma.customTheme.findFirst
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(themeRow({ id: 2, name: "Cyberpunk (Copy)" }))
        .mockResolvedValueOnce(themeRow({ id: 3, name: "Cyberpunk (Copy 2)" }))
        .mockResolvedValueOnce(null);
      const duplicated = themeRow({ id: 4, name: "Cyberpunk (Copy 3)" });
      mockPrisma.customTheme.create.mockResolvedValue(duplicated);

      const req = reqFor(duplicateCustomTheme, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.customTheme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ name: "Cyberpunk (Copy 3)" }),
        })
      );
    });

    it("returns 500 on database error", async () => {
      mockPrisma.customTheme.findFirst.mockRejectedValue(new Error("DB fail"));

      const req = reqFor(duplicateCustomTheme, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicateCustomTheme);
      await duplicateCustomTheme(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
