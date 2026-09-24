import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Downloads from "@/components/pages/Downloads";
import { showError, showSuccess } from "@/utils/toast";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

function download(overrides: Record<string, unknown>) {
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
    filePath: null,
    progress: 100,
    error: null,
    createdAt: "2026-09-23T00:00:00.000Z",
    completedAt: "2026-09-23T00:00:00.000Z",
    expiresAt: null,
    ...overrides,
  };
}

function mockDownloads(downloads: Record<string, unknown>[]) {
  mockApiGet.mockImplementation(async (endpoint: string) => {
    if (endpoint === "/downloads") return { downloads };
    throw new Error(`unexpected GET ${endpoint}`);
  });
}

describe("Downloads page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("thumbnails without an instance ask for no instance", async () => {
    mockDownloads([
      download({ id: 1, instanceId: null }),
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
    await screen.findAllByText("file");

    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src")
    );
    expect(srcs).toEqual([
      `/api/proxy/stash?path=${encodeURIComponent("/scene/12/screenshot")}`,
      "/api/proxy/image/34/thumbnail",
    ]);
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
    mockDownloads([download({ id: 7, fileSize: 1536 })]);

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

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" })
    ).not.toBeInTheDocument();
  });

  it("an active download without progress shows no progress bar", async () => {
    mockDownloads([download({ status: "PENDING", progress: undefined })]);

    render(<Downloads />);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("an unknown status shows as Pending", async () => {
    mockDownloads([download({ status: "QUEUED" })]);

    render(<Downloads />);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
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

  it("treats a response without a list as empty", async () => {
    mockApiGet.mockResolvedValue({});

    render(<Downloads />);

    expect(await screen.findByText("No downloads yet")).toBeInTheDocument();
  });

  it("reports a failed load and shows the empty state", async () => {
    mockApiGet.mockRejectedValue(new Error("offline"));

    render(<Downloads />);

    expect(await screen.findByText("No downloads yet")).toBeInTheDocument();
    expect(showError).toHaveBeenCalledWith("Failed to load downloads");
  });

  it("shows placeholders for a missing name, size and date", async () => {
    mockDownloads([
      download({ fileName: null, fileSize: null, createdAt: null }),
      download({ id: 2, fileName: ".mp4", fileSize: 0 }),
    ]);

    render(<Downloads />);

    expect(await screen.findAllByText("Untitled")).toHaveLength(2);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("0 B")).not.toBeInTheDocument();
  });

  describe("polling", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("polls every 3 seconds while a download is active and stops once none is", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      let calls = 0;
      mockApiGet.mockImplementation(async () => {
        calls++;
        return {
          downloads: [
            download({
              status: calls < 2 ? "PROCESSING" : "COMPLETED",
              progress: 50,
            }),
          ],
        };
      });

      render(<Downloads />);
      expect(await screen.findByText("Processing")).toBeInTheDocument();
      expect(mockApiGet).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(await screen.findByText("Completed")).toBeInTheDocument();
      expect(mockApiGet).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(9000);
      });
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });
  });
});
