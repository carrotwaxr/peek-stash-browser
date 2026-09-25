import type {
  DatabaseBackup,
  ListDatabaseBackupsResponse,
} from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiPost } from "../../../../src/api";
import BackupTab from "../../../../src/components/settings/tabs/BackupTab";
import { showError, showSuccess } from "../../../../src/utils/toast";

vi.mock("../../../../src/api", async () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: (await import("../../../../src/api/client")).ApiError,
}));

vi.mock("../../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const mockGet = vi.mocked(apiGet);
const mockPost = vi.mocked(apiPost);

const DIR = "/app/data";

function backup(
  filename: string,
  kind: DatabaseBackup["kind"],
  version: string | null = null
): DatabaseBackup {
  return {
    filename,
    kind,
    version,
    path: `${DIR}/${filename}`,
    size: 4096,
    createdAt: "2026-09-24T10:11:12.000Z",
  };
}

function listing(...backups: DatabaseBackup[]): ListDatabaseBackupsResponse {
  return { backups, directory: DIR };
}

const MANUAL = backup("peek-stash-browser.db.backup-20260924-101112", "manual");

describe("BackupTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the rows visible while refreshing", async () => {
    let answerRefresh: (value: ListDatabaseBackupsResponse) => void = () => {};
    const second = backup(
      "peek-stash-browser.db.backup-20260924-101112-2",
      "manual"
    );
    mockGet.mockResolvedValueOnce(listing(MANUAL)).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerRefresh = resolve;
        })
    );
    mockPost.mockResolvedValue({ backup: second });

    render(<BackupTab />);
    expect(await screen.findByText(MANUAL.path)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Backup" }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    // The refresh is still running: the list stays
    expect(screen.getByText(MANUAL.path)).toBeInTheDocument();
    expect(screen.queryByText("Loading backups...")).not.toBeInTheDocument();

    answerRefresh(listing(second, MANUAL));
    expect(await screen.findByText(second.path)).toBeInTheDocument();
    expect(screen.getByText(MANUAL.path)).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith("Backup created");
  });

  it("labels a pre-migration backup 'Before upgrading to 3.5.0'", async () => {
    const pre = backup(
      "peek-stash-browser.db.backup-20260924-101112-pre-3.5.0",
      "preMigration",
      "3.5.0"
    );
    const legacy = backup(
      "peek-stash-browser.db.backup.20251201_083000",
      "legacy"
    );
    mockGet.mockResolvedValue(listing(pre, MANUAL, legacy));

    render(<BackupTab />);

    expect(
      await screen.findByText("Before upgrading to 3.5.0")
    ).toBeInTheDocument();
    expect(screen.getByText("Created in Peek")).toBeInTheDocument();
    expect(
      screen.getByText("Before an upgrade (older Peek)")
    ).toBeInTheDocument();
    // Each row says where its file is
    expect(screen.getByText(pre.path)).toBeInTheDocument();
    expect(screen.getByText(legacy.path)).toBeInTheDocument();
  });

  it("says where the backups are and that there is no download", async () => {
    mockGet.mockResolvedValue(listing(MANUAL));

    render(<BackupTab />);

    expect(await screen.findByText(DIR)).toBeInTheDocument();
    expect(
      screen.getByText(/password hash/, { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /download/i })
    ).not.toBeInTheDocument();
  });

  it("shows the server's error when a backup fails", async () => {
    mockGet.mockResolvedValue(listing(MANUAL));
    mockPost.mockRejectedValue(
      new ApiError("Failed to create backup", 500, {
        error: "Failed to create backup",
        message: "database or disk is full",
      })
    );

    render(<BackupTab />);
    expect(await screen.findByText(MANUAL.path)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Backup" }));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith(
        "Failed to create backup: database or disk is full"
      )
    );
    expect(screen.getByText(MANUAL.path)).toBeInTheDocument();
  });
});
