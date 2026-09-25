import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "../../../../src/api";
import MergeRecoveryTab from "../../../../src/components/settings/tabs/MergeRecoveryTab";
import { must } from "../../../testUtils";

vi.mock("../../../../src/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("../../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const mockGet = vi.mocked(apiGet);
const mockPost = vi.mocked(apiPost);

/** Scene 5 left both Stash servers; each copy has its own activity */
const ORPHANS = [
  {
    id: "5",
    instanceId: "inst-a",
    instanceName: "Stash A",
    title: "Scene Five",
    deletedAt: "2026-09-23T15:26:31.000Z",
    phash: "abcdef0123456789",
    userActivityCount: 2,
    totalPlayCount: 3,
    hasRatings: true,
    hasFavorites: false,
  },
  {
    id: "5",
    instanceId: "inst-b",
    instanceName: "Stash B",
    title: "Scene Five",
    deletedAt: "2026-09-23T15:26:31.000Z",
    phash: "abcdef0123456789",
    userActivityCount: 1,
    totalPlayCount: 10,
    hasRatings: false,
    hasFavorites: false,
  },
];

const MATCH_ON_B = {
  sceneId: "7",
  instanceId: "inst-b",
  instanceName: "Stash B",
  title: "Scene Seven",
  similarity: "exact",
  recommended: true,
};

describe("MergeRecoveryTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/admin/orphaned-scenes"
          ? { scenes: ORPHANS, totalCount: ORPHANS.length }
          : { matches: [MATCH_ON_B] }
      )
    );
    mockPost.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("two orphans with the same id on different instances render as two rows", async () => {
    render(<MergeRecoveryTab />);

    expect(await screen.findByText("on Stash A")).toBeInTheDocument();
    expect(screen.getByText("on Stash B")).toBeInTheDocument();
    expect(screen.getAllByText("Scene Five")).toHaveLength(2);

    // Expanding one opens that row only, with matches from its instance
    fireEvent.click(screen.getByText("on Stash B"));

    expect(await screen.findByText("Scene Seven")).toBeInTheDocument();
    expect(screen.getAllByText("Potential matches:")).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith(
      "/admin/orphaned-scenes/5%3Ainst-b/matches"
    );
    expect(
      screen.getByPlaceholderText("Scene ID on Stash B")
    ).toBeInTheDocument();
  });

  it("Transfer and Discard post to /admin/orphaned-scenes/5%3Ainst-b/...", async () => {
    render(<MergeRecoveryTab />);
    fireEvent.click(await screen.findByText("on Stash B"));
    await screen.findByText("Scene Seven");

    fireEvent.click(
      must(screen.getAllByRole("button", { name: "Transfer" })[0], "match")
    );
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/admin/orphaned-scenes/5%3Ainst-b/reconcile",
        { targetSceneId: "7" }
      )
    );

    // The list reloads after a transfer (the orphans, the matches, the
    // orphans again); the row stays open
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
    fireEvent.change(
      await screen.findByPlaceholderText("Scene ID on Stash B"),
      {
        target: { value: "9" },
      }
    );
    fireEvent.click(
      must(screen.getAllByRole("button", { name: "Transfer" })[1], "manual")
    );
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/admin/orphaned-scenes/5%3Ainst-b/reconcile",
        { targetSceneId: "9" }
      )
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4));
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard Activity" })
    );
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/admin/orphaned-scenes/5%3Ainst-b/discard"
      )
    );
  });
});
