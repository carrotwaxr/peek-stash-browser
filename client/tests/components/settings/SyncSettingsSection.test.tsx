import type {
  SyncEntityState,
  SyncInstanceStatus,
  SyncStatusResponse,
} from "@peek/shared-types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createAuthValue, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/client";
import SyncSettingsSection from "../../../src/components/settings/SyncSettingsSection";
import { useAuth } from "../../../src/hooks/useAuth";
import { showError } from "../../../src/utils/toast";

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

type ApiMock = (...args: unknown[]) => Promise<unknown>;
const mockApiGet = vi.fn<ApiMock>();
const mockApiPost = vi.fn<ApiMock>();
const mockApiPut = vi.fn<ApiMock>();
vi.mock("../../../src/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
}));

const ENTITY_TYPES = [
  ["tag", "Tags"],
  ["studio", "Studios"],
  ["performer", "Performers"],
  ["group", "Collections"],
  ["gallery", "Galleries"],
  ["scene", "Scenes"],
  ["clip", "Clips"],
  ["image", "Images"],
] as const;

const STUDIO_ERROR =
  "FindStudios: runtime error: invalid memory address or nil pointer dereference (at findStudios.studios.3.image_path) (HTTP 200)";
const REFUSAL =
  "Cleanup refused: Stash no longer lists 80 of 120 scenes (more than half); apply the deletions from the sync status if this is intended";
const SKIP =
  "Cleanup skipped: Stash returned 100 of 120 performers (page 2 was empty)";

/** One type's state, synced cleanly unless `overrides` say otherwise. */
function entityState(
  entityType: string,
  overrides: Partial<SyncEntityState> = {}
): SyncEntityState {
  return {
    entityType,
    lastFullSyncTimestamp: "2026-09-20T10:00:00+00:00",
    lastIncrementalSyncTimestamp: "2026-09-24T09:30:00+00:00",
    lastFullSyncActual: "2026-09-20T10:05:00.000Z",
    lastIncrementalSyncActual: "2026-09-24T09:31:00.000Z",
    lastSyncCount: 1234,
    lastSyncDurationMs: 1500,
    lastError: null,
    totalEntities: 120,
    ...overrides,
  };
}

/** An instance with all eight types, `errors` stored on some of them. */
function instance(
  instanceId: string,
  name: string,
  errors: Partial<Record<string, string>> = {}
): SyncInstanceStatus {
  return {
    instanceId,
    name,
    enabled: true,
    firstSyncedAt: "2026-09-20T08:00:00.000Z",
    states: ENTITY_TYPES.map(([type]) =>
      entityState(type, { lastError: errors[type] ?? null })
    ),
  };
}

function status(
  overrides: Partial<SyncStatusResponse> = {}
): SyncStatusResponse {
  return {
    inProgress: false,
    activeJob: null,
    settings: { syncIntervalMinutes: 60, enableScanSubscription: true },
    instances: [instance("default", "Stash")],
    ...overrides,
  };
}

/** Answer GET /sync/status with `answer`. */
function statusIs(answer: SyncStatusResponse): void {
  mockApiGet.mockImplementation((endpoint) =>
    endpoint === "/sync/status"
      ? Promise.resolve(answer)
      : Promise.reject(new Error(`unexpected GET ${String(endpoint)}`))
  );
}

/** The status table of one instance, once it has loaded. */
const table = (name: string) => screen.findByRole("table", { name });

/** A table's body rows as [type, ...cells] text. */
function rowTexts(tableEl: HTMLElement): string[][] {
  return within(tableEl)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent ?? "")
    );
}

const statusCalls = () =>
  mockApiGet.mock.calls.filter(([endpoint]) => endpoint === "/sync/status")
    .length;

describe("SyncSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(
      createAuthValue({
        isAuthenticated: true,
        user: { id: 1, username: "admin", role: "ADMIN" },
      })
    );
    mockApiPost.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders one status table per instance with its entity types and a stored error", async () => {
    statusIs(
      status({
        instances: [
          instance("default", "Stash"),
          instance("two", "StashTwo", { studio: STUDIO_ERROR }),
        ],
      })
    );

    render(<SyncSettingsSection />);

    expect(
      await screen.findByRole("heading", { name: "Sync status" })
    ).toBeInTheDocument();
    const first = rowTexts(await table("Stash"));
    const second = rowTexts(await table("StashTwo"));

    for (const rows of [first, second]) {
      expect(rows.map((cells) => cells[0])).toEqual(
        ENTITY_TYPES.map(([, label]) => label)
      );
    }
    // Every problem cell of the first instance is empty
    expect(first.map((cells) => cells[4])).toEqual(ENTITY_TYPES.map(() => ""));
    const studios = must(
      second.find((cells) => cells[0] === "Studios"),
      "the Studios row"
    );
    expect(studios[4]).toBe(STUDIO_ERROR);
    // The last run: count and duration
    expect(studios[3]).toBe("1,234 in 1.5 s");
    // The other rows of the second instance have no problem
    expect(
      second.filter((cells) => cells[0] !== "Studios").map((cells) => cells[4])
    ).toEqual(ENTITY_TYPES.slice(1).map(() => ""));
  });

  it("shows Abort only while a sync runs and posts /sync/abort", async () => {
    statusIs(status());
    const idle = render(<SyncSettingsSection />);
    await table("Stash");
    expect(screen.queryByRole("button", { name: "Abort sync" })).toBeNull();
    idle.unmount();

    statusIs(status({ inProgress: true, activeJob: "sync" }));
    render(<SyncSettingsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Abort sync" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/sync/abort");
    });
  });

  it("shows 'Removing a deleted instance' while activeJob is instance-delete", async () => {
    statusIs(status({ inProgress: false, activeJob: "instance-delete" }));

    render(<SyncSettingsSection />);

    expect(
      await screen.findByText(/Removing a deleted instance/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abort sync" })).toBeNull();
  });

  it("polls the status every 10 s only while a job runs", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    statusIs(status());
    const idle = render(<SyncSettingsSection />);
    await table("Stash");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(statusCalls()).toBe(1);
    idle.unmount();

    mockApiGet.mockClear();
    statusIs(status({ inProgress: true, activeJob: "sync" }));
    render(<SyncSettingsSection />);
    await screen.findByRole("button", { name: "Abort sync" });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    await waitFor(() => {
      expect(statusCalls()).toBe(3);
    });
  });

  it("reloads the status when a sync starts elsewhere on the page", async () => {
    statusIs(status());
    const { rerender } = render(<SyncSettingsSection syncStarts={0} />);
    await table("Stash");

    statusIs(status({ inProgress: true, activeJob: "sync" }));
    rerender(<SyncSettingsSection syncStarts={1} />);

    expect(
      await screen.findByRole("button", { name: "Abort sync" })
    ).toBeInTheDocument();
  });

  it("shows Apply deletions only for a refused cleanup and posts after confirming", async () => {
    statusIs(
      status({
        instances: [
          instance("default", "Stash", {
            scene: REFUSAL,
            performer: SKIP,
            studio: STUDIO_ERROR,
          }),
        ],
      })
    );
    render(<SyncSettingsSection />);
    const tableEl = await table("Stash");

    const buttons = within(tableEl).getAllByRole("button", {
      name: "Apply deletions",
    });
    expect(buttons).toHaveLength(1);
    const scenesRow = must(
      within(tableEl)
        .getAllByRole("row")
        .find((row) => row.textContent?.startsWith("Scenes")),
      "the Scenes row"
    );
    expect(within(scenesRow).getByRole("button")).toBe(buttons[0]);

    fireEvent.click(must(buttons[0], "the Apply deletions button"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("80 of 120 scenes");
    expect(dialog).toHaveTextContent("Stash");
    expect(mockApiPost).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply deletions" })
    );

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/sync/cleanup", {
        instanceId: "default",
        entityType: "scene",
      });
    });
  });

  it("Cancel in the Apply deletions dialog sends nothing", async () => {
    statusIs(
      status({ instances: [instance("default", "Stash", { scene: REFUSAL })] })
    );
    render(<SyncSettingsSection />);
    const tableEl = await table("Stash");

    fireEvent.click(
      within(tableEl).getByRole("button", { name: "Apply deletions" })
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      })
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("a 409 from Apply deletions shows the server's message", async () => {
    statusIs(
      status({ instances: [instance("default", "Stash", { scene: REFUSAL })] })
    );
    mockApiPost.mockRejectedValue(
      new ApiError("A sync is already running", 409, {
        error: "A sync is already running",
      })
    );
    render(<SyncSettingsSection />);
    const tableEl = await table("Stash");

    fireEvent.click(
      within(tableEl).getByRole("button", { name: "Apply deletions" })
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Apply deletions",
      })
    );

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("A sync is already running");
    });
  });
});
