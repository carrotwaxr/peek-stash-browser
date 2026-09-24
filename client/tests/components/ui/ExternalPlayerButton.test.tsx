/**
 * ExternalPlayerButton (sweep item 2): the VLC link is the server's signed
 * personal link, fetched when the page mounts; copying falls back to a
 * selectable field where the clipboard API is missing.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueryWrapper } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api";
import ExternalPlayerButton from "@/components/ui/ExternalPlayerButton";

vi.mock("@/api", () => ({
  apiPost: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const mockApiPost = vi.mocked(apiPost);

const LINK = {
  url: "/api/scene/5/proxy-stream/stream?instanceId=i&uid=1&exp=9&sig=abc",
  expiresAt: "2026-09-24T00:00:00.000Z",
};

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function renderButton() {
  return render(
    <ExternalPlayerButton sceneId="5" instanceId="i" title="Scene 5" />,
    { wrapper: createQueryWrapper() }
  );
}

describe("ExternalPlayerButton", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    "clipboard"
  );

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "userAgent", {
      value: DESKTOP_UA,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(
        Navigator.prototype,
        "clipboard",
        originalClipboard
      );
    }
    // Drop any instance override
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  });

  it("links VLC to the server's signed URL", async () => {
    mockApiPost.mockResolvedValue(LINK);

    renderButton();

    const anchor = screen.getByLabelText("Open in VLC");
    await waitFor(() => {
      expect(anchor).toHaveAttribute(
        "href",
        `vlc://${window.location.origin}/api/scene/5/proxy-stream/stream?instanceId=i&uid=1&exp=9&sig=abc`
      );
    });
    expect(mockApiPost).toHaveBeenCalledWith("/scene/5/external-player-link", {
      instanceId: "i",
    });
    expect(anchor).not.toHaveAttribute("aria-disabled");
  });

  it("renders no href until the link has loaded", async () => {
    mockApiPost.mockReturnValue(new Promise(() => {}));

    renderButton();

    const anchor = screen.getByLabelText("Open in VLC");
    expect(anchor).not.toHaveAttribute("href");
    expect(anchor).toHaveAttribute("aria-disabled", "true");
  });

  it("copy falls back to a selectable field when navigator.clipboard is missing", async () => {
    mockApiPost.mockResolvedValue(LINK);
    // userEvent.setup() installs a clipboard stub; a plain-HTTP origin has none
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    renderButton();
    await waitFor(() => {
      expect(screen.getByLabelText("Open in VLC")).toHaveAttribute("href");
    });

    await user.click(screen.getByLabelText("More options"));
    await user.click(screen.getByRole("button", { name: /Copy Stream URL/ }));

    const field = screen.getByRole("textbox", { name: "Stream URL" });
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveValue(`${window.location.origin}${LINK.url}`);
    expect(screen.getByText(/Press Ctrl\+C to copy/)).toBeInTheDocument();
  });

  it("hides the button when the server answers 404", async () => {
    const { ApiError } = await import("@/api");
    mockApiPost.mockRejectedValue(
      new (ApiError as new (m: string, s: number) => Error)("Not found", 404)
    );

    renderButton();

    await waitFor(() => {
      expect(screen.queryByLabelText("Open in VLC")).toBeNull();
    });
  });
});
