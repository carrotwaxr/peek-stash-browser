import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import PlexSignIn from "@/components/auth/PlexSignIn";

let enabled = true;
let poll: unknown;
let failure = false;
let request: Mock<(input: string, init?: RequestInit) => Promise<Response>>;

beforeEach(() => {
  vi.useFakeTimers();
  enabled = true;
  failure = false;
  poll = { status: "pending" };
  request = vi.fn(async (input: string, init?: RequestInit) => {
    await Promise.resolve();
    if (input.endsWith("/config")) return Response.json({ enabled });
    if (input.endsWith("/start"))
      return Response.json({
        correlationId: "correlation",
        authorizationUrl: "https://app.plex.tv/auth#?code=temporary",
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      });
    if (input.endsWith("/poll"))
      return failure
        ? Response.json({ error: "Account is not approved" }, { status: 403 })
        : Response.json(poll);
    if (input.endsWith("/cancel")) return Response.json({ success: true });
    throw new Error(`Unexpected request: ${input} ${init?.method}`);
  });
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function show(link = false) {
  await act(async () => {
    render(<PlexSignIn link={link} />);
    await Promise.resolve();
  });
}
async function start() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", {
        name: /Sign in with Plex|Link Plex account/,
      })
    );
    await Promise.resolve();
  });
}

describe("Plex sign-in", () => {
  it("uses the protected owner-connection flow without signing into a Peek profile", async () => {
    poll = { status: "connected" };
    const completed = vi.fn();
    await act(async () => {
      render(<PlexSignIn connect onLinked={completed} />);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Plex owner account" })
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(
      request.mock.calls.some(([url]) => url.endsWith("/admin/connect/start"))
    ).toBe(true);
    expect(
      request.mock.calls.some(([url]) => url.endsWith("/admin/connect/poll"))
    ).toBe(true);
    expect(completed).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      "owner account connected"
    );
  });
  it("does not show a button when disabled", async () => {
    enabled = false;
    await show();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows authorization in a separate tab, waits, and cancels polling", async () => {
    await show();
    await start();
    expect(
      screen.getByRole("link", { name: "Open Plex to authorize" })
    ).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Plex");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(request.mock.calls.some(([url]) => url.endsWith("/poll"))).toBe(
      true
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Cancel Plex sign-in" })
      );
      await Promise.resolve();
    });
    const calls = request.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(request.mock.calls).toHaveLength(calls);
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
  });
  it("shows a denial and allows retry", async () => {
    failure = true;
    await show();
    await start();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByRole("status")).toHaveTextContent("not approved");
    expect(
      screen.getByRole("button", { name: "Sign in with Plex" })
    ).toBeInTheDocument();
  });
  it("expires pending sign-ins", async () => {
    await show();
    await start();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("expired");
  });
  it("sends local proof only to the linking endpoint and reports completion", async () => {
    poll = { status: "complete", linked: true };
    await show(true);
    fireEvent.change(
      screen.getByLabelText("Current local password for Plex linking"),
      { target: { value: "local-password" } }
    );
    await start();
    const started = request.mock.calls.find(([url]) =>
      url.endsWith("/link/start")
    );
    expect(started?.[1]?.body).toBe(
      JSON.stringify({ password: "local-password" })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByRole("status")).toHaveTextContent("linked");
  });
});
