import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createQueryWrapper, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HiddenItemsPage from "@/components/pages/HiddenItemsPage";

const mockApiGet = vi.fn();
const mockApiDelete = vi.fn();

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  // Signed out: the settings query stays off, so the hide dialog is asked
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: vi.fn(() => ({ isTVMode: false })),
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

/** A summary URL exactly as the server builds it (toProxyUrl) */
const proxyUrl = (path: string, instanceId: string) =>
  `/api/proxy/stash?path=${encodeURIComponent(path)}&instanceId=${instanceId}`;

const hiddenRow = (
  id: number,
  entityType: string,
  entityId: string,
  instanceId: string,
  summary: { name: string | null; imageUrl: string | null } | null
) => ({
  id,
  entityType,
  entityId,
  instanceId,
  hiddenAt: "2026-09-20T00:00:00.000Z",
  restricted: summary === null,
  summary: summary && {
    id: entityId,
    instanceId: instanceId || "inst-a",
    ...summary,
  },
});

const visibleScene = hiddenRow(1, "scene", "12", "", {
  name: "A visible scene",
  imageUrl: proxyUrl("/scene/12/screenshot", "inst-a"),
});

// A hidden row the user may no longer see arrives without its summary
const restrictedTag = hiddenRow(2, "tag", "7", "inst-a", null);

const COUNTS = {
  scene: 1,
  performer: 0,
  studio: 0,
  tag: 1,
  group: 0,
  gallery: 0,
  image: 0,
  clip: 0,
};

function renderPage(route = "/hidden-items") {
  const QueryWrapper = createQueryWrapper();
  return render(<HiddenItemsPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[route]}>
        <QueryWrapper>{children}</QueryWrapper>
      </MemoryRouter>
    ),
  });
}

/** Stands in for the browser's Back button */
const BrowserBack = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        void navigate(-1);
      }}
    >
      Browser back
    </button>
  );
};

describe("HiddenItemsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No IntersectionObserver: LazyImage loads at once
    vi.stubGlobal("IntersectionObserver", undefined);
    mockApiGet.mockResolvedValue({
      items: [visibleScene, restrictedTag],
      total: 2,
      counts: COUNTS,
    });
    mockApiDelete.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the tab title is Hidden Items - Peek, and Peek again once the page is left", async () => {
    const { unmount } = renderPage();

    await screen.findByText("A visible scene");
    expect(document.title).toBe("Hidden Items - Peek");

    unmount();
    expect(document.title).toBe("Peek");
  });

  it("asks for the first page of every type", async () => {
    renderPage();

    await screen.findByText("A visible scene");
    expect(mockApiGet).toHaveBeenCalledWith(
      "/user/hidden-entities?page=1&per_page=50"
    );
  });

  it("shows a row without details as its type, marked unavailable", async () => {
    renderPage();

    expect(await screen.findByText("A visible scene")).toBeInTheDocument();
    expect(screen.getByText("Tag")).toBeInTheDocument();
    expect(screen.getByText(/Details unavailable/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("tab badges show the counts", async () => {
    mockApiGet.mockResolvedValue({
      items: [visibleScene],
      total: 123,
      counts: { ...COUNTS, scene: 120, performer: 3, tag: 0 },
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "All 123" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scenes 120" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Performers 3" })).toBeVisible();
    // A type with nothing hidden has no tab
    expect(screen.queryByRole("button", { name: /^Tags/ })).toBeNull();
  });

  it("a tab asks for its own type", async () => {
    renderPage("/hidden-items?tab=tag");

    await screen.findByText("Tag");
    expect(mockApiGet).toHaveBeenCalledWith(
      "/user/hidden-entities?entityType=tag&page=1&per_page=50"
    );
  });

  it("Back from a tab returns to the tab the URL names, on its first page", async () => {
    mockApiGet.mockResolvedValue({
      items: [visibleScene],
      total: 120,
      counts: { ...COUNTS, scene: 120, tag: 0 },
    });
    const QueryWrapper = createQueryWrapper();
    render(
      <MemoryRouter initialEntries={["/hidden-items"]}>
        <QueryWrapper>
          <HiddenItemsPage />
          <BrowserBack />
        </QueryWrapper>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Scenes 120" }));
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        "/user/hidden-entities?entityType=scene&page=1&per_page=50"
      )
    );
    await screen.findByText("A visible scene");
    fireEvent.click(must(screen.getAllByRole("button", { name: /next/i })[0]));
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        "/user/hidden-entities?entityType=scene&page=2&per_page=50"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));

    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        "/user/hidden-entities?page=1&per_page=50"
      )
    );
  });

  it("pages with Pagination when there is more than one page", async () => {
    mockApiGet.mockResolvedValue({
      items: [visibleScene],
      total: 120,
      counts: { ...COUNTS, scene: 120, tag: 0 },
    });
    renderPage();
    await screen.findByText("A visible scene");

    fireEvent.click(must(screen.getAllByRole("button", { name: /next/i })[0]));

    await waitFor(() =>
      expect(mockApiGet).toHaveBeenCalledWith(
        "/user/hidden-entities?page=2&per_page=50"
      )
    );
  });

  it("a thumbnail uses the summary's URL as it is", async () => {
    renderPage();

    const img = await screen.findByAltText("A visible scene");
    await waitFor(() =>
      expect(img).toHaveAttribute(
        "src",
        proxyUrl("/scene/12/screenshot", "inst-a")
      )
    );
  });

  it("a hidden performer's thumbnail is the summary's URL, never wrapped again in /api/proxy/stash?path=", async () => {
    const url = proxyUrl("/performer/5/image", "inst-a");
    mockApiGet.mockResolvedValue({
      items: [
        hiddenRow(3, "performer", "5", "inst-a", {
          name: "Performer Five",
          imageUrl: url,
        }),
      ],
      total: 1,
      counts: { ...COUNTS, scene: 0, tag: 0, performer: 1 },
    });
    renderPage();

    const img = await screen.findByAltText("Performer Five");
    await waitFor(() => expect(img).toHaveAttribute("src", url));
    expect(img.getAttribute("src")).not.toContain(
      encodeURIComponent("/api/proxy/")
    );
  });

  it("a hidden scene, collection, gallery and image each show a thumbnail", async () => {
    const rows = [
      ["scene", "Scene S"],
      ["group", "Collection C"],
      ["gallery", "Gallery G"],
      ["image", "Image I"],
    ].map(([type, name], i) =>
      hiddenRow(10 + i, must(type), String(i), "inst-a", {
        name: must(name),
        imageUrl: proxyUrl(`/${must(type)}/${i}/thumb`, "inst-a"),
      })
    );
    mockApiGet.mockResolvedValue({
      items: rows,
      total: 4,
      counts: { ...COUNTS, scene: 1, tag: 0, group: 1, gallery: 1, image: 1 },
    });
    renderPage();

    for (const [i, name] of [
      "Scene S",
      "Collection C",
      "Gallery G",
      "Image I",
    ].entries()) {
      const img = await screen.findByAltText(name);
      await waitFor(() =>
        expect(img).toHaveAttribute(
          "src",
          proxyUrl(
            `/${["scene", "group", "gallery", "image"][i]}/${i}/thumb`,
            "inst-a"
          )
        )
      );
    }
  });

  it("the Clips tab lists a hidden clip with its thumbnail", async () => {
    const clip = hiddenRow(20, "clip", "31", "inst-a", {
      name: "A hidden clip",
      imageUrl: proxyUrl("/clip/31/screenshot", "inst-a"),
    });
    mockApiGet.mockResolvedValue({
      items: [clip],
      total: 1,
      counts: { ...COUNTS, scene: 0, tag: 0, clip: 1 },
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Clips 1" }));
    expect(mockApiGet).toHaveBeenLastCalledWith(
      "/user/hidden-entities?entityType=clip&page=1&per_page=50"
    );
    const img = await screen.findByAltText("A hidden clip");
    await waitFor(() =>
      expect(img).toHaveAttribute(
        "src",
        proxyUrl("/clip/31/screenshot", "inst-a")
      )
    );
  });

  it("restores a row without details on its own instance", async () => {
    renderPage();
    await screen.findByText("Tag");

    const [, tagRestore] = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(must(tagRestore));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/user/hidden-entities/tag/7?instanceId=inst-a"
      )
    );
  });

  it("restores a hide stored for every instance without an instance", async () => {
    renderPage();
    await screen.findByText("A visible scene");

    const [sceneRestore] = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(must(sceneRestore));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/user/hidden-entities/scene/12"
      )
    );
  });

  it("Restore invalidates the list", async () => {
    renderPage();
    await screen.findByText("A visible scene");
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    mockApiGet.mockResolvedValue({
      items: [restrictedTag],
      total: 1,
      counts: { ...COUNTS, scene: 0 },
    });
    const [sceneRestore] = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(must(sceneRestore));

    await waitFor(() =>
      expect(screen.queryByText("A visible scene")).not.toBeInTheDocument()
    );
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});
