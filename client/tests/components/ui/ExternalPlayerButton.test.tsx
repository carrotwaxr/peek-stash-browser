/**
 * ExternalPlayerButton (sweep item 2): the VLC link is the server's signed
 * personal link, fetched when the page mounts; copying falls back to a
 * selectable field where the clipboard API is missing.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueryWrapper } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api";
import ExternalPlayerButton from "@/components/ui/ExternalPlayerButton";
import { showSuccess } from "@/utils/toast";

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

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const setUserAgent = (ua: string) =>
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });

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
    setUserAgent(DESKTOP_UA);
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

  it("renders nothing without a scene id", () => {
    const { container } = render(
      <ExternalPlayerButton sceneId="" instanceId="i" title="Scene" />,
      { wrapper: createQueryWrapper() }
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("keeps the button, without a link, when the link request fails with another error", async () => {
    const { ApiError } = await import("@/api");
    mockApiPost.mockRejectedValue(
      new (ApiError as new (m: string, s: number) => Error)("Server error", 500)
    );

    renderButton();

    await waitFor(() => expect(mockApiPost).toHaveBeenCalled());
    const anchor = screen.getByLabelText("Open in VLC");
    expect(anchor).not.toHaveAttribute("href");
    expect(anchor).toHaveAttribute("aria-disabled", "true");
  });

  it("on Android opens the stream with an intent carrying the scene title", async () => {
    setUserAgent(ANDROID_UA);
    mockApiPost.mockResolvedValue(LINK);

    renderButton();

    const anchor = screen.getByLabelText("Open in external player");
    await waitFor(() => expect(anchor).toHaveAttribute("href"));
    const href = anchor.getAttribute("href") as string;
    const origin = new URL(window.location.origin);
    expect(href.startsWith(`intent://${origin.host}/api/scene/5/`)).toBe(true);
    expect(href).toContain("sig=abc");
    expect(href).toContain(
      `#Intent;action=android.intent.action.VIEW;scheme=${origin.protocol.slice(0, -1)};type=video/mp4;S.title=Scene%205;end`
    );
    // Mobile has no dropdown
    expect(screen.queryByLabelText("More options")).not.toBeInTheDocument();
  });

  it("on Android falls back to the title Video for an untitled scene", async () => {
    setUserAgent(ANDROID_UA);
    mockApiPost.mockResolvedValue(LINK);

    render(<ExternalPlayerButton sceneId="5" instanceId="i" title="" />, {
      wrapper: createQueryWrapper(),
    });

    const anchor = screen.getByLabelText("Open in external player");
    await waitFor(() =>
      expect(anchor.getAttribute("href")).toContain("S.title=Video;end")
    );
  });

  it("on iOS opens VLC's x-callback URL with the encoded stream", async () => {
    setUserAgent(IPHONE_UA);
    mockApiPost.mockResolvedValue(LINK);

    renderButton();

    const anchor = screen.getByLabelText("Open in external player");
    await waitFor(() => expect(anchor).toHaveAttribute("href"));
    expect(anchor).toHaveAttribute(
      "href",
      `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(
        `${window.location.origin}${LINK.url}`
      )}`
    );
    expect(screen.queryByLabelText("More options")).not.toBeInTheDocument();
  });

  it("on a phone shows a disabled link until the stream link loads", () => {
    setUserAgent(IPHONE_UA);
    mockApiPost.mockReturnValue(new Promise(() => {}));

    renderButton();

    const anchor = screen.getByLabelText("Open in external player");
    expect(anchor).not.toHaveAttribute("href");
    expect(anchor).toHaveAttribute("aria-disabled", "true");
  });

  it("copies the absolute stream URL, confirms, and closes the menu", async () => {
    mockApiPost.mockResolvedValue(LINK);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderButton();
    await waitFor(() => {
      expect(screen.getByLabelText("Open in VLC")).toHaveAttribute("href");
    });

    await user.click(screen.getByLabelText("More options"));
    expect(screen.getByLabelText("More options")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await user.click(screen.getByRole("button", { name: /Copy Stream URL/ }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${LINK.url}`
    );
    expect(showSuccess).toHaveBeenCalledWith("Stream URL copied to clipboard");
    expect(
      screen.queryByRole("button", { name: /Copy Stream URL/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Stream URL" })
    ).not.toBeInTheDocument();
  });

  it("shows the selectable field when the clipboard refuses the write", async () => {
    mockApiPost.mockResolvedValue(LINK);
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    renderButton();
    await waitFor(() => {
      expect(screen.getByLabelText("Open in VLC")).toHaveAttribute("href");
    });

    await user.click(screen.getByLabelText("More options"));
    await user.click(screen.getByRole("button", { name: /Copy Stream URL/ }));

    expect(screen.getByRole("textbox", { name: "Stream URL" })).toHaveValue(
      `${window.location.origin}${LINK.url}`
    );
    expect(showSuccess).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("shows the selectable field when the clipboard has no writeText", async () => {
    mockApiPost.mockResolvedValue(LINK);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: {},
      configurable: true,
    });

    renderButton();
    await waitFor(() => {
      expect(screen.getByLabelText("Open in VLC")).toHaveAttribute("href");
    });

    await user.click(screen.getByLabelText("More options"));
    await user.click(screen.getByRole("button", { name: /Copy Stream URL/ }));

    expect(
      screen.getByRole("textbox", { name: "Stream URL" })
    ).toBeInTheDocument();
  });

  it("disables Copy Stream URL until the link has loaded", async () => {
    mockApiPost.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByLabelText("More options"));

    expect(
      screen.getByRole("button", { name: /Copy Stream URL/ })
    ).toBeDisabled();
  });

  it("closes the menu on a click outside but not on a click inside it", async () => {
    mockApiPost.mockResolvedValue(LINK);
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByLabelText("More options"));
    const copy = screen.getByRole("button", { name: /Copy Stream URL/ });

    fireEvent.mouseDown(copy);
    expect(
      screen.getByRole("button", { name: /Copy Stream URL/ })
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole("button", { name: /Copy Stream URL/ })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("More options")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("closes the menu when the page scrolls, and the toggle closes it too", async () => {
    mockApiPost.mockResolvedValue(LINK);
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByLabelText("More options"));
    fireEvent.scroll(window);
    expect(
      screen.queryByRole("button", { name: /Copy Stream URL/ })
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("More options"));
    expect(
      screen.getByRole("button", { name: /Copy Stream URL/ })
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("More options"));
    expect(
      screen.queryByRole("button", { name: /Copy Stream URL/ })
    ).not.toBeInTheDocument();
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
