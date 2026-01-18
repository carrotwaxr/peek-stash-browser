# Database Backup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to create, view, and delete database backups from the Settings UI.

**Architecture:** A DatabaseBackupService handles file operations (list, create via VACUUM INTO, delete). Express routes expose admin-only endpoints. A React BackupTab component provides the UI in Server Settings.

**Tech Stack:** Node.js fs/promises, SQLite VACUUM INTO via Prisma raw query, Express routes, React component

---

### Task 1: DatabaseBackupService - listBackups

**Files:**
- Create: `server/services/DatabaseBackupService.ts`
- Create: `server/tests/services/DatabaseBackupService.test.ts`

**Step 1: Write the failing test**

```typescript
// server/tests/services/DatabaseBackupService.test.ts
/**
 * Unit Tests for DatabaseBackupService
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";

// Mock fs/promises
vi.mock("fs/promises");

// Mock environment
const originalEnv = process.env;

describe("DatabaseBackupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CONFIG_DIR: "/app/data" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe("listBackups", () => {
    it("should return empty array when no backups exist", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db",
        "other-file.txt",
      ] as any);

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      expect(backups).toEqual([]);
    });

    it("should return backup files with metadata", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db",
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260117-093045",
      ] as any);

      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        if (filename === "peek-stash-browser.db.backup-20260118-104532") {
          return { size: 246747136, mtime: new Date("2026-01-18T10:45:32.000Z") } as any;
        }
        return { size: 123456789, mtime: new Date("2026-01-17T09:30:45.000Z") } as any;
      });

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0].filename).toBe("peek-stash-browser.db.backup-20260118-104532");
      expect(backups[0].size).toBe(246747136);
      expect(backups[1].filename).toBe("peek-stash-browser.db.backup-20260117-093045");
    });

    it("should sort backups by date descending (newest first)", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db.backup-20260117-093045",
        "peek-stash-browser.db.backup-20260118-104532",
      ] as any);

      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        if (filename.includes("20260118")) {
          return { size: 100, mtime: new Date("2026-01-18T10:45:32.000Z") } as any;
        }
        return { size: 100, mtime: new Date("2026-01-17T09:30:45.000Z") } as any;
      });

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      expect(backups[0].filename).toContain("20260118");
      expect(backups[1].filename).toContain("20260117");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run tests/services/DatabaseBackupService.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// server/services/DatabaseBackupService.ts
/**
 * DatabaseBackupService
 *
 * Handles database backup operations:
 * - List existing backups
 * - Create new backups using VACUUM INTO
 * - Delete backup files
 */
import fs from "fs/promises";
import path from "path";

const BACKUP_PATTERN = /^peek-stash-browser\.db\.backup-\d{8}-\d{6}$/;

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: Date;
}

class DatabaseBackupService {
  private getDataDir(): string {
    return process.env.CONFIG_DIR || "/app/data";
  }

  /**
   * List all backup files with metadata.
   * Returns sorted by date descending (newest first).
   */
  async listBackups(): Promise<BackupInfo[]> {
    const dataDir = this.getDataDir();
    const files = await fs.readdir(dataDir);

    const backupFiles = files.filter((f) => BACKUP_PATTERN.test(f));

    const backups: BackupInfo[] = await Promise.all(
      backupFiles.map(async (filename) => {
        const filePath = path.join(dataDir, filename);
        const stat = await fs.stat(filePath);
        return {
          filename,
          size: stat.size,
          createdAt: stat.mtime,
        };
      })
    );

    // Sort by date descending (newest first)
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return backups;
  }
}

export const databaseBackupService = new DatabaseBackupService();
```

**Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run tests/services/DatabaseBackupService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/DatabaseBackupService.ts server/tests/services/DatabaseBackupService.test.ts
git commit -m "feat(backup): add DatabaseBackupService with listBackups"
```

---

### Task 2: DatabaseBackupService - createBackup

**Files:**
- Modify: `server/services/DatabaseBackupService.ts`
- Modify: `server/tests/services/DatabaseBackupService.test.ts`

**Step 1: Write the failing test**

Add to `server/tests/services/DatabaseBackupService.test.ts`:

```typescript
// Mock prisma - add at top with other mocks
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $executeRawUnsafe: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";

// Add this describe block after listBackups tests:
describe("createBackup", () => {
  it("should create a backup with timestamped filename", async () => {
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0);
    vi.mocked(fs.stat).mockResolvedValue({
      size: 246747136,
      mtime: new Date("2026-01-18T10:45:32.000Z"),
    } as any);

    const { databaseBackupService } = await import(
      "../../services/DatabaseBackupService.js"
    );

    // Mock Date to get predictable filename
    const mockDate = new Date("2026-01-18T10:45:32.000Z");
    vi.setSystemTime(mockDate);

    const backup = await databaseBackupService.createBackup();

    expect(backup.filename).toBe("peek-stash-browser.db.backup-20260118-104532");
    expect(backup.size).toBe(246747136);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("VACUUM INTO")
    );

    vi.useRealTimers();
  });

  it("should throw error if VACUUM INTO fails", async () => {
    vi.mocked(prisma.$executeRawUnsafe).mockRejectedValue(
      new Error("Database locked")
    );

    const { databaseBackupService } = await import(
      "../../services/DatabaseBackupService.js"
    );

    await expect(databaseBackupService.createBackup()).rejects.toThrow(
      "Database locked"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run tests/services/DatabaseBackupService.test.ts`
Expected: FAIL with "createBackup is not a function" or similar

**Step 3: Write minimal implementation**

Add to `server/services/DatabaseBackupService.ts`:

```typescript
// Add import at top
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Add method to class:
/**
 * Create a new backup using SQLite VACUUM INTO.
 * Returns info about the created backup.
 */
async createBackup(): Promise<BackupInfo> {
  const dataDir = this.getDataDir();
  const timestamp = this.formatTimestamp(new Date());
  const filename = `peek-stash-browser.db.backup-${timestamp}`;
  const backupPath = path.join(dataDir, filename);

  logger.info(`Creating database backup: ${filename}`);

  // Use VACUUM INTO for atomic, consistent backup
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);

  const stat = await fs.stat(backupPath);

  logger.info(`Backup created successfully: ${filename} (${stat.size} bytes)`);

  return {
    filename,
    size: stat.size,
    createdAt: stat.mtime,
  };
}

private formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run tests/services/DatabaseBackupService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/DatabaseBackupService.ts server/tests/services/DatabaseBackupService.test.ts
git commit -m "feat(backup): add createBackup using VACUUM INTO"
```

---

### Task 3: DatabaseBackupService - deleteBackup

**Files:**
- Modify: `server/services/DatabaseBackupService.ts`
- Modify: `server/tests/services/DatabaseBackupService.test.ts`

**Step 1: Write the failing test**

Add to `server/tests/services/DatabaseBackupService.test.ts`:

```typescript
describe("deleteBackup", () => {
  it("should delete a valid backup file", async () => {
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const { databaseBackupService } = await import(
      "../../services/DatabaseBackupService.js"
    );

    await databaseBackupService.deleteBackup(
      "peek-stash-browser.db.backup-20260118-104532"
    );

    expect(fs.unlink).toHaveBeenCalledWith(
      "/app/data/peek-stash-browser.db.backup-20260118-104532"
    );
  });

  it("should reject invalid filenames (path traversal prevention)", async () => {
    const { databaseBackupService } = await import(
      "../../services/DatabaseBackupService.js"
    );

    await expect(
      databaseBackupService.deleteBackup("../../../etc/passwd")
    ).rejects.toThrow("Invalid backup filename");

    await expect(
      databaseBackupService.deleteBackup("peek-stash-browser.db")
    ).rejects.toThrow("Invalid backup filename");

    await expect(
      databaseBackupService.deleteBackup("random-file.txt")
    ).rejects.toThrow("Invalid backup filename");

    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it("should throw error if file does not exist", async () => {
    vi.mocked(fs.unlink).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const { databaseBackupService } = await import(
      "../../services/DatabaseBackupService.js"
    );

    await expect(
      databaseBackupService.deleteBackup(
        "peek-stash-browser.db.backup-20260118-104532"
      )
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run tests/services/DatabaseBackupService.test.ts`
Expected: FAIL with "deleteBackup is not a function"

**Step 3: Write minimal implementation**

Add to `server/services/DatabaseBackupService.ts`:

```typescript
/**
 * Delete a backup file.
 * Validates filename to prevent path traversal attacks.
 */
async deleteBackup(filename: string): Promise<void> {
  // Security: validate filename matches expected pattern
  if (!BACKUP_PATTERN.test(filename)) {
    throw new Error("Invalid backup filename");
  }

  const dataDir = this.getDataDir();
  const filePath = path.join(dataDir, filename);

  logger.info(`Deleting backup: ${filename}`);
  await fs.unlink(filePath);
  logger.info(`Backup deleted: ${filename}`);
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run tests/services/DatabaseBackupService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/DatabaseBackupService.ts server/tests/services/DatabaseBackupService.test.ts
git commit -m "feat(backup): add deleteBackup with path traversal protection"
```

---

### Task 4: Database Backup Routes

**Files:**
- Create: `server/routes/databaseBackup.ts`
- Create: `server/tests/routes/databaseBackup.test.ts`

**Step 1: Write the failing test**

```typescript
// server/tests/routes/databaseBackup.test.ts
/**
 * Unit Tests for Database Backup Routes (Admin API)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock DatabaseBackupService
vi.mock("../../services/DatabaseBackupService.js", () => ({
  databaseBackupService: {
    listBackups: vi.fn(),
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock("../../middleware/auth.js", () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { databaseBackupService } from "../../services/DatabaseBackupService.js";

const mockService = vi.mocked(databaseBackupService);

function createMockRequest(options: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: { id: number; username: string; role: string };
} = {}): Partial<Request> {
  return {
    params: options.params || {},
    body: options.body || {},
    user: options.user,
  } as Partial<Request>;
}

function createMockResponse() {
  const responseJson = vi.fn();
  const responseStatus = vi.fn(() => ({ json: responseJson }));
  return {
    json: responseJson,
    status: responseStatus,
    responseJson,
    responseStatus,
  };
}

describe("Database Backup Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("GET /api/admin/database/backups", () => {
    it("should return list of backups", async () => {
      const mockBackups = [
        {
          filename: "peek-stash-browser.db.backup-20260118-104532",
          size: 246747136,
          createdAt: new Date("2026-01-18T10:45:32.000Z"),
        },
      ];
      mockService.listBackups.mockResolvedValue(mockBackups);

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      // Find and call the route handler
      const layer = router.stack.find(
        (l: any) => l.route?.path === "/database/backups" && l.route?.methods?.get
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(mockService.listBackups).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ backups: mockBackups });
    });

    it("should return 500 on service error", async () => {
      mockService.listBackups.mockRejectedValue(new Error("Disk error"));

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/database/backups" && l.route?.methods?.get
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Failed to list backups",
        message: "Disk error",
      });
    });
  });

  describe("POST /api/admin/database/backup", () => {
    it("should create a backup and return info", async () => {
      const mockBackup = {
        filename: "peek-stash-browser.db.backup-20260118-104532",
        size: 246747136,
        createdAt: new Date("2026-01-18T10:45:32.000Z"),
      };
      mockService.createBackup.mockResolvedValue(mockBackup);

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/database/backup" && l.route?.methods?.post
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(mockService.createBackup).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ backup: mockBackup });
    });
  });

  describe("DELETE /api/admin/database/backups/:filename", () => {
    it("should delete a backup", async () => {
      mockService.deleteBackup.mockResolvedValue(undefined);

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        params: { filename: "peek-stash-browser.db.backup-20260118-104532" },
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) =>
          l.route?.path === "/database/backups/:filename" &&
          l.route?.methods?.delete
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(mockService.deleteBackup).toHaveBeenCalledWith(
        "peek-stash-browser.db.backup-20260118-104532"
      );
      expect(json).toHaveBeenCalledWith({ ok: true });
    });

    it("should return 400 for invalid filename", async () => {
      mockService.deleteBackup.mockRejectedValue(
        new Error("Invalid backup filename")
      );

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        params: { filename: "../etc/passwd" },
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) =>
          l.route?.path === "/database/backups/:filename" &&
          l.route?.methods?.delete
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(responseStatus).toHaveBeenCalledWith(400);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run tests/routes/databaseBackup.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// server/routes/databaseBackup.ts
/**
 * Database Backup Routes (Admin Only)
 *
 * Handles admin endpoints for database backup management:
 * - GET /api/admin/database/backups - List all backups
 * - POST /api/admin/database/backup - Create a new backup
 * - DELETE /api/admin/database/backups/:filename - Delete a backup
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { databaseBackupService } from "../services/DatabaseBackupService.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/database/backups
 * List all database backups
 */
router.get(
  "/database/backups",
  authenticated(async (_req, res) => {
    try {
      const backups = await databaseBackupService.listBackups();
      res.json({ backups });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list backups",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/database/backup
 * Create a new database backup
 */
router.post(
  "/database/backup",
  authenticated(async (_req, res) => {
    try {
      const backup = await databaseBackupService.createBackup();
      res.json({ backup });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create backup",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * DELETE /api/admin/database/backups/:filename
 * Delete a specific backup
 */
router.delete(
  "/database/backups/:filename",
  authenticated(async (req, res) => {
    try {
      const { filename } = req.params;
      await databaseBackupService.deleteBackup(filename);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Invalid") ? 400 : 500;
      res.status(status).json({
        error: "Failed to delete backup",
        message,
      });
    }
  })
);

export default router;
```

**Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run tests/routes/databaseBackup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/databaseBackup.ts server/tests/routes/databaseBackup.test.ts
git commit -m "feat(api): add database backup admin routes"
```

---

### Task 5: Register Routes

**Files:**
- Modify: `server/initializers/api.ts`

**Step 1: Add import and registration**

Add after line 31 (after mergeReconciliationRoutes import):

```typescript
import databaseBackupRoutes from "../routes/databaseBackup.js";
```

Add after line 120 (after mergeReconciliationRoutes registration):

```typescript
// Database backup routes (admin only)
app.use("/api/admin", databaseBackupRoutes);
```

**Step 2: Run server tests to ensure no regressions**

Run: `cd server && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/initializers/api.ts
git commit -m "feat(api): register database backup routes"
```

---

### Task 6: BackupTab Component

**Files:**
- Create: `client/src/components/settings/tabs/BackupTab.jsx`

**Step 1: Create the component**

```jsx
// client/src/components/settings/tabs/BackupTab.jsx
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Trash2 } from "lucide-react";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const formatBytes = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const BackupTab = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/admin/database/backups");
      setBackups(response.data.backups);
    } catch {
      showError("Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      await api.post("/admin/database/backup");
      showSuccess("Backup created successfully");
      fetchBackups();
    } catch {
      showError("Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!confirm(`Are you sure you want to delete this backup?\n\n${filename}\n\nThis cannot be undone.`)) {
      return;
    }
    try {
      setDeleting(filename);
      await api.delete(`/admin/database/backups/${encodeURIComponent(filename)}`);
      showSuccess("Backup deleted");
      fetchBackups();
    } catch {
      showError("Failed to delete backup");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading backups...</div>;
  }

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Database Backup
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Create and manage database backups
            </p>
          </div>
          <Button
            onClick={handleCreateBackup}
            disabled={creating}
            variant="primary"
          >
            {creating ? "Creating..." : "Create Backup"}
          </Button>
        </div>

        {backups.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            No backups yet. Create your first backup to protect your data.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              {backups.length} backup{backups.length !== 1 ? "s" : ""} available
            </p>

            {backups.map((backup) => (
              <div
                key={backup.filename}
                className="flex justify-between items-center p-3 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {formatDate(backup.createdAt)}
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {formatBytes(backup.size)}
                  </p>
                </div>
                <Button
                  onClick={() => handleDeleteBackup(backup.filename)}
                  disabled={deleting === backup.filename}
                  variant="danger"
                  size="sm"
                >
                  {deleting === backup.filename ? (
                    "Deleting..."
                  ) : (
                    <Trash2 size={16} />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupTab;
```

**Step 2: Verify component renders (manual check after integration)**

**Step 3: Commit**

```bash
git add client/src/components/settings/tabs/BackupTab.jsx
git commit -m "feat(ui): add BackupTab component"
```

---

### Task 7: Integrate BackupTab into SettingsPage

**Files:**
- Modify: `client/src/components/pages/SettingsPage.jsx`

**Step 1: Add import and tab**

Add import after line 16:

```jsx
import BackupTab from "../settings/tabs/BackupTab.jsx";
```

Modify SERVER_TABS (around line 28-32) to add the new tab:

```jsx
const SERVER_TABS = [
  { id: "server-config", label: "Server Configuration" },
  { id: "user-management", label: "User Management" },
  { id: "merge-recovery", label: "Merge Recovery" },
  { id: "backup", label: "Backup" },
];
```

Add rendering after line 121 (after MergeRecoveryTab):

```jsx
{activeTab === "backup" && <BackupTab />}
```

**Step 2: Run client tests to ensure no regressions**

Run: `cd client && npm test`
Expected: All tests pass

**Step 3: Run client build**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add client/src/components/pages/SettingsPage.jsx
git commit -m "feat(ui): add Backup tab to Server Settings"
```

---

### Task 8: Manual Testing & Final Verification

**Step 1: Start the application**

Run: `docker compose up`

**Step 2: Test the feature**

1. Navigate to Settings → Server → Backup
2. Click "Create Backup" - should show success toast and new backup in list
3. Verify backup appears with correct date and size
4. Click delete button - should prompt for confirmation
5. Confirm delete - should remove backup from list

**Step 3: Run all tests**

Run: `cd server && npm test && npm run lint && npx tsc --noEmit`
Run: `cd client && npm test && npm run lint && npm run build`

Expected: All checks pass

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```

---

## Summary

1. **Task 1**: DatabaseBackupService listBackups (tests + implementation)
2. **Task 2**: DatabaseBackupService createBackup (tests + implementation)
3. **Task 3**: DatabaseBackupService deleteBackup (tests + implementation)
4. **Task 4**: Database backup routes (tests + implementation)
5. **Task 5**: Register routes in api.ts
6. **Task 6**: BackupTab React component
7. **Task 7**: Integrate into SettingsPage
8. **Task 8**: Manual testing and verification

Total commits: ~8 focused commits following TDD principles.
