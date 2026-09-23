import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Downloads from "@/components/pages/Downloads";

const mockApiGet = vi.fn();

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));

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
});
