import type { ReactElement } from "react";
import type {
  GetUserDownloadsResponse,
  SerializedDownload,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as renderPlain,
  screen,
  waitFor,
} from "@testing-library/react";
import { actAsync, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import Downloads from "@/components/pages/Downloads";
import { showError, showSuccess } from "@/utils/toast";

const mockApiGet = vi.fn<(endpoint: string) => Promise<unknown>>();
const mockApiPost = vi.fn<(endpoint: string) => Promise<unknown>>();
const mockApiDelete = vi.fn<(endpoint: string) => Promise<unknown>>();

vi.mock("@/api", () => ({
  apiGet: (endpoint: string) => mockApiGet(endpoint),
  apiPost: (endpoint: string) => mockApiPost(endpoint),
  apiDelete: (endpoint: string) => mockApiDelete(endpoint),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

/** The cache the page's downloads query lives in; a visit reuses it */
let queryClient: QueryClient;

/** Renders inside the test's QueryClientProvider */
function render(ui: ReactElement) {
  return renderPlain(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function download(overrides: Partial<SerializedDownload>): SerializedDownload {
  return {
    id: 1,
    userId: 1,
    type: "SCENE",
    status: "COMPLETED",
    playlistId: null,
    entityType: "scene",
    entityId: "12",
    instanceId: "inst-a",
    fileName: "file.mp4",
    fileSize: "1000",
    progress: 100,
    error: null,
    skippedItems: 0,
    createdAt: new Date("2026-09-23T00:00:00.000Z"),
    completedAt: new Date("2026-09-23T00:00:00.000Z"),
    expiresAt: null,
    ...overrides,
  };
}

function mockDownloads(downloads: SerializedDownload[]) {
  mockApiGet.mockImplementation((endpoint: string) => {
    if (endpoint === "/downloads") {
      const response: GetUserDownloadsResponse = { downloads };
      return Promise.resolve(response);
    }
    return Promise.reject(new Error(`unexpected GET ${endpoint}`));
  });
}

describe("Downloads page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("scene and image thumbnails ask for the download's instance", async () => {
    mockDownloads([
      download({ id: 1, instanceId: "inst-b" }),
      download({
        id: 2,
        type: "IMAGE",
        entityType: "image",
        entityId: "34",
        instanceId: "inst-b",
        fileName: "file.jpg",
      }),
    ]);

    const { container } = render(<Downloads />);
    await screen.findAllByText("file");

    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src")
    );
    expect(srcs).toHaveLength(2);
    for (const src of srcs) {
      expect(src).toContain("instanceId=inst-b");
    }
  });

  it("an expired download shows Expired, a hint to download again, and no Download link", async () => {
    mockDownloads([download({ status: "EXPIRED", instanceId: "" })]);

    render(<Downloads />);

    expect(await screen.findByText("Expired")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This download has expired. Download it again from the scene page."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" })
    ).not.toBeInTheDocument();
  });

  it("an expired playlist zip says to download the playlist again", async () => {
    mockDownloads([
      download({
        type: "PLAYLIST",
        status: "EXPIRED",
        entityType: null,
        entityId: null,
        instanceId: "",
        playlistId: 5,
        fileName: "p.zip",
      }),
    ]);

    render(<Downloads />);

    expect(await screen.findByText("Expired")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This download has expired. Download the playlist again."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" })
    ).not.toBeInTheDocument();
  });

  it("an expired image says to download it again from the image", async () => {
    mockDownloads([
      download({
        type: "IMAGE",
        status: "EXPIRED",
        entityType: "image",
        fileName: "photo.jpg",
      }),
    ]);

    render(<Downloads />);

    expect(await screen.findByText("Expired")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This download has expired. Download it again from the image."
      )
    ).toBeInTheDocument();
  });

  it("an expired download of an unknown type shows the badge without a hint", async () => {
    mockDownloads([download({ type: "ARCHIVE", status: "EXPIRED" })]);

    render(<Downloads />);

    expect(await screen.findByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText(/has expired/)).not.toBeInTheDocument();
  });

  it("an image download with no instance shows no thumbnail request", async () => {
    mockDownloads([
      download({ id: 1, instanceId: "", fileName: "scene.mp4" }),
      download({
        id: 2,
        type: "IMAGE",
        entityType: "image",
        entityId: "34",
        instanceId: "",
        fileName: "file.jpg",
      }),
    ]);

    const { container } = render(<Downloads />);
    await screen.findByText("file");

    // Such rows answer 410 anyway; a thumbnail would only be refused
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("scene")).toBeInTheDocument();
  });

  it("encodes the instance into the thumbnail URLs", async () => {
    mockDownloads([
      download({ id: 1, instanceId: "inst a&b" }),
      download({
        id: 2,
        type: "IMAGE",
        entityType: "image",
        entityId: "34",
        instanceId: "inst a&b",
        fileName: "file.jpg",
      }),
    ]);

    const { container } = render(<Downloads />);
    await screen.findAllByText("file");

    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src")
    );
    expect(srcs).toEqual([
      `/api/proxy/stash?path=${encodeURIComponent("/scene/12/screenshot")}&instanceId=inst%20a%26b`,
      "/api/proxy/image/34/thumbnail?instanceId=inst%20a%26b",
    ]);
  });

  it("swaps a broken scene or image thumbnail for an icon", async () => {
    mockDownloads([
      download({ id: 1 }),
      download({
        id: 2,
        type: "IMAGE",
        entityType: "image",
        entityId: "34",
        fileName: "file.jpg",
      }),
    ]);

    const { container } = render(<Downloads />);
    await screen.findAllByText("file");

    for (const img of Array.from(container.querySelectorAll("img"))) {
      const frame = img.parentElement as HTMLElement;
      fireEvent.error(img);
      expect(frame.querySelector("img")).toBeNull();
      expect(frame.querySelector("svg")).not.toBeNull();
      expect(frame).toHaveClass("flex", "items-center", "justify-center");
    }
  });

  it("a playlist or a download without an entity gets an icon, not an image", async () => {
    mockDownloads([
      download({
        id: 1,
        type: "PLAYLIST",
        entityType: null,
        entityId: null,
        fileName: "p.zip",
      }),
      download({ id: 2, entityId: null, fileName: "orphan.mp4" }),
    ]);

    const { container } = render(<Downloads />);
    await screen.findByText("p");

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("orphan")).toBeInTheDocument();
  });

  it("a completed download links to its file", async () => {
    mockDownloads([download({ id: 7, fileSize: "1536" })]);

    render(<Downloads />);

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "/api/downloads/7/file");
    expect(link).toHaveAttribute("download", "file.mp4");
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" })
    ).not.toBeInTheDocument();
  });

  it("a pending or processing download shows its progress", async () => {
    mockDownloads([
      download({ id: 1, status: "PENDING", progress: 0, fileName: "a.mp4" }),
      download({
        id: 2,
        status: "PROCESSING",
        progress: 42,
        fileName: "b.mp4",
      }),
    ]);

    render(<Downloads />);

    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" })
    ).not.toBeInTheDocument();
  });

  it("a pending zip reads Queued", async () => {
    mockDownloads([
      download({ status: "PENDING", progress: 0, type: "PLAYLIST" }),
    ]);

    render(<Downloads />);

    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("an unknown status shows as Queued", async () => {
    mockDownloads([download({ status: "WAITING" })]);

    render(<Downloads />);

    expect(await screen.findByText("Queued")).toBeInTheDocument();
  });

  it("a completed zip with skipped scenes says how many", async () => {
    mockDownloads([
      download({
        id: 1,
        type: "PLAYLIST",
        entityType: null,
        entityId: null,
        fileName: "two.zip",
        skippedItems: 2,
      }),
      download({
        id: 2,
        type: "PLAYLIST",
        entityType: null,
        entityId: null,
        fileName: "one.zip",
        skippedItems: 1,
      }),
    ]);

    render(<Downloads />);

    expect(
      await screen.findByText("2 scenes could not be included")
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 scene could not be included")
    ).toBeInTheDocument();
  });

  it("a completed zip with none skipped shows no note", async () => {
    mockDownloads([
      download({
        type: "PLAYLIST",
        entityType: null,
        entityId: null,
        fileName: "all.zip",
        skippedItems: 0,
      }),
    ]);

    render(<Downloads />);

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText(/could not be included/)).not.toBeInTheDocument();
  });

  it("a failed download shows its error and retries on request", async () => {
    mockDownloads([
      download({ id: 9, status: "FAILED", error: "Stash unreachable" }),
    ]);
    mockApiPost.mockResolvedValue({});

    render(<Downloads />);

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Stash unreachable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Download queued for retry")
    );
    expect(mockApiPost).toHaveBeenCalledWith("/downloads/9/retry");
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it("reports a failed retry", async () => {
    mockDownloads([download({ id: 9, status: "FAILED", error: "x" })]);
    mockApiPost.mockRejectedValue(new Error("nope"));

    render(<Downloads />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Failed to retry download")
    );
  });

  it("deletes a download and reloads the list", async () => {
    mockDownloads([download({ id: 4 })]);
    mockApiDelete.mockResolvedValue({});

    render(<Downloads />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Download removed")
    );
    expect(mockApiDelete).toHaveBeenCalledWith("/downloads/4");
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it("reports a failed delete", async () => {
    mockDownloads([download({ id: 4 })]);
    mockApiDelete.mockRejectedValue(new Error("nope"));

    render(<Downloads />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Failed to delete download")
    );
  });

  it("shows the empty state when there are no downloads", async () => {
    mockDownloads([]);

    render(<Downloads />);

    expect(await screen.findByText("No downloads yet")).toBeInTheDocument();
  });

  it("reports a failed load and shows the empty state", async () => {
    mockApiGet.mockRejectedValue(new Error("offline"));

    render(<Downloads />);

    expect(await screen.findByText("No downloads yet")).toBeInTheDocument();
    expect(showError).toHaveBeenCalledWith("Failed to load downloads");
  });

  it("shows placeholders for a missing name and size", async () => {
    mockDownloads([
      download({ fileName: "", fileSize: null }),
      download({ id: 2, fileName: ".mp4", fileSize: "0" }),
    ]);

    render(<Downloads />);

    expect(await screen.findAllByText("Untitled")).toHaveLength(2);
    expect(screen.queryByText("0 B")).not.toBeInTheDocument();
  });

  describe("polling", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("asks again every 3 s while a job is pending and stops once none is", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      let calls = 0;
      mockApiGet.mockImplementation(() => {
        calls++;
        return Promise.resolve({
          downloads: [
            download({
              status: calls < 3 ? "PENDING" : "COMPLETED",
              progress: 0,
            }),
          ],
        });
      });

      render(<Downloads />);
      expect(await screen.findByText("Queued")).toBeInTheDocument();
      expect(mockApiGet).toHaveBeenCalledTimes(1);

      await actAsync(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(mockApiGet).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Queued")).toBeInTheDocument();

      await actAsync(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(await screen.findByText("Completed")).toBeInTheDocument();
      expect(mockApiGet).toHaveBeenCalledTimes(3);

      await actAsync(() => {
        vi.advanceTimersByTime(9000);
      });
      expect(mockApiGet).toHaveBeenCalledTimes(3);
    });
  });

  it("removing a download drops its row without a reload", async () => {
    let rows = [
      download({ id: 4, fileName: "gone.mp4" }),
      download({ id: 5, fileName: "kept.mp4" }),
    ];
    mockApiGet.mockImplementation(() => Promise.resolve({ downloads: rows }));
    mockApiDelete.mockImplementation(() => {
      rows = rows.filter((d) => d.id !== 4);
      return Promise.resolve({});
    });

    render(<Downloads />);
    await screen.findByText("gone");
    fireEvent.click(must(screen.getAllByRole("button", { name: "Delete" })[0]));

    await waitFor(() =>
      expect(screen.queryByText("gone")).not.toBeInTheDocument()
    );
    expect(screen.getByText("kept")).toBeInTheDocument();
  });

  it("a download started from the player is listed on the next visit without waiting", async () => {
    let rows: SerializedDownload[] = [];
    mockApiGet.mockImplementation(() => Promise.resolve({ downloads: rows }));

    const first = render(<Downloads />);
    expect(await screen.findByText("No downloads yet")).toBeInTheDocument();
    first.unmount();

    // The start site marks the query stale; the page was not mounted
    rows = [download({ id: 8, status: "PENDING", fileName: "new.mp4" })];
    await queryClient.invalidateQueries({
      queryKey: queryKeys.downloads.all(),
    });
    expect(
      queryClient.getQueryState(queryKeys.downloads.all())?.isInvalidated
    ).toBe(true);

    render(<Downloads />);
    expect(await screen.findByText("new")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});
