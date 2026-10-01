import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost, getMyPermissions } from "@/api";
import { useImageDownload } from "@/hooks/useImageDownload";
import { showError, showSuccess } from "@/utils/toast";

vi.mock("@/api", () => ({
  apiPost: vi.fn(),
  getMyPermissions: vi.fn(),
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const mockApiPost = vi.mocked(apiPost);
const mockGetMyPermissions = vi.mocked(getMyPermissions);
const mockShowError = vi.mocked(showError);
const mockShowSuccess = vi.mocked(showSuccess);

const realLocation = window.location;

describe("useImageDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { href: "" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: realLocation,
    });
  });

  it("canDownload is true only with Can Download Files", async () => {
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadFiles: false },
    });
    const denied = renderHook(() => useImageDownload(true));
    await waitFor(() => expect(mockGetMyPermissions).toHaveBeenCalled());
    expect(denied.result.current.canDownload).toBe(false);

    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadFiles: true },
    });
    const allowed = renderHook(() => useImageDownload(true));
    await waitFor(() => expect(allowed.result.current.canDownload).toBe(true));
  });

  it("does not ask for permissions while disabled", () => {
    renderHook(() => useImageDownload(false));
    expect(mockGetMyPermissions).not.toHaveBeenCalled();
  });

  it("posts the image's instance and navigates to the file", async () => {
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadFiles: true },
    });
    mockApiPost.mockResolvedValue({
      download: { id: 12, status: "COMPLETED" },
    });
    const { result } = renderHook(() => useImageDownload(true));

    await act(async () => {
      await result.current.download({ id: "img-9", instanceId: "inst-b" });
    });

    expect(mockApiPost).toHaveBeenCalledWith("/downloads/image/img-9", {
      instanceId: "inst-b",
    });
    expect(window.location.href).toBe("/api/downloads/12/file");
    expect(mockShowSuccess).toHaveBeenCalledWith("Download started");
    expect(result.current.downloading).toBe(false);
  });

  it("shows the server's error text on a refusal and does not navigate", async () => {
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadFiles: true },
    });
    mockApiPost.mockRejectedValue(
      Object.assign(new Error("Request failed"), {
        data: { error: "Image not found" },
      })
    );
    const { result } = renderHook(() => useImageDownload(true));

    await act(async () => {
      await result.current.download({ id: "img-9", instanceId: "inst-b" });
    });

    expect(mockShowError).toHaveBeenCalledWith("Image not found");
    expect(window.location.href).toBe("");
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(result.current.downloading).toBe(false);
  });
});
