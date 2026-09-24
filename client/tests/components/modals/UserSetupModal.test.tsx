import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userSetupApi } from "../../../src/api";
import UserSetupModal from "../../../src/components/modals/UserSetupModal";

// Mock the API
vi.mock("../../../src/api", () => ({
  userSetupApi: {
    getSetupStatus: vi.fn(),
    completeSetup: vi.fn(),
  },
}));

const { mockUpdateUser } = vi.hoisted(() => ({ mockUpdateUser: vi.fn() }));

// Mock useAuth
vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, setupCompleted: false },
    updateUser: mockUpdateUser,
  }),
}));

const mockGetSetupStatus = vi.mocked(userSetupApi.getSetupStatus);
const mockCompleteSetup = vi.mocked(userSetupApi.completeSetup);

const KEY = "ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456";

describe("UserSetupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Continue and no recovery key before setup completes", async () => {
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [{ id: "inst-1", name: "Main", description: "" }],
      instanceCount: 1,
    });

    render(<UserSetupModal onComplete={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Your Recovery Key")).not.toBeInTheDocument();
    expect(screen.queryByText("Content Sources")).not.toBeInTheDocument();
    expect(mockCompleteSetup).not.toHaveBeenCalled();
  });

  it("shows instance selection when multiple instances exist", async () => {
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [
        { id: "inst-1", name: "Main Server", description: "Primary" },
        { id: "inst-2", name: "Backup", description: "Archive" },
      ],
      instanceCount: 2,
    });

    render(<UserSetupModal onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Content Sources")).toBeInTheDocument();
      expect(screen.getByText("Main Server")).toBeInTheDocument();
      expect(screen.getByText("Backup")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
  });

  it("shows the key returned by completeSetup, then finishes on Get Started", async () => {
    const onComplete = vi.fn();
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [],
      instanceCount: 1,
    });
    mockCompleteSetup.mockResolvedValue({ success: true, recoveryKey: KEY });

    render(<UserSetupModal onComplete={onComplete} />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByText(KEY)).toBeInTheDocument();
    expect(screen.getByText("Your Recovery Key")).toBeInTheDocument();
    expect(mockCompleteSetup).toHaveBeenCalledWith([]);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

    expect(mockUpdateUser).toHaveBeenCalledWith({ setupCompleted: true });
    expect(onComplete).toHaveBeenCalled();
  });

  it("finishes at once when completeSetup returns no key", async () => {
    const onComplete = vi.fn();
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [],
      instanceCount: 1,
    });
    mockCompleteSetup.mockResolvedValue({ success: true, recoveryKey: null });

    render(<UserSetupModal onComplete={onComplete} />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ setupCompleted: true });
    expect(screen.queryByText("Your Recovery Key")).not.toBeInTheDocument();
  });

  it("sends the selected content sources and keeps at least one ticked", async () => {
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [
        { id: "inst-1", name: "Main Server", description: null },
        { id: "inst-2", name: "Backup", description: "Archive" },
      ],
      instanceCount: 2,
    });
    mockCompleteSetup.mockResolvedValue({ success: true, recoveryKey: KEY });

    render(<UserSetupModal onComplete={vi.fn()} />);

    const main = (await screen.findByText("Main Server"))
      .closest("label")
      ?.querySelector("input") as HTMLInputElement;
    const backup = screen
      .getByText("Backup")
      .closest("label")
      ?.querySelector("input") as HTMLInputElement;
    expect(main.checked).toBe(true);
    expect(backup.checked).toBe(true);

    fireEvent.click(main);
    expect(main.checked).toBe(false);
    // The last ticked source cannot be unticked
    fireEvent.click(backup);
    expect(backup.checked).toBe(true);
    fireEvent.click(main);
    fireEvent.click(backup);
    expect(main.checked).toBe(true);
    expect(backup.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText(KEY);
    expect(mockCompleteSetup).toHaveBeenCalledWith(["inst-1"]);
  });

  it("treats a status without instances as a single source", async () => {
    mockGetSetupStatus.mockResolvedValue(
      {} as Awaited<ReturnType<typeof userSetupApi.getSetupStatus>>
    );
    mockCompleteSetup.mockResolvedValue({ success: true, recoveryKey: null });

    render(<UserSetupModal />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ setupCompleted: true });
    });
    expect(screen.queryByText("Content Sources")).not.toBeInTheDocument();
    expect(mockCompleteSetup).toHaveBeenCalledWith([]);
  });

  it("shows the error and stays on step one when completing setup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [],
      instanceCount: 1,
    });
    mockCompleteSetup.mockRejectedValue(new Error("Server unavailable"));

    render(<UserSetupModal onComplete={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByText("Your Recovery Key")).not.toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("shows a generic error when the failure has no message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSetupStatus.mockResolvedValue({
      setupCompleted: false,
      instances: [],
      instanceCount: 1,
    });
    mockCompleteSetup.mockRejectedValue(new Error(""));

    render(<UserSetupModal onComplete={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Failed to complete setup")
    ).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("offers a retry when the setup status cannot load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSetupStatus.mockRejectedValue(new Error("offline"));

    render(<UserSetupModal onComplete={vi.fn()} />);

    expect(
      await screen.findByText("Failed to load setup data")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" })
    ).not.toBeInTheDocument();
    errorSpy.mockRestore();
  });

  describe("copying the recovery key", () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard"
    );

    afterEach(() => {
      vi.useRealTimers();
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
      }
    });

    async function showKey() {
      mockGetSetupStatus.mockResolvedValue({
        setupCompleted: false,
        instances: [],
        instanceCount: 1,
      });
      mockCompleteSetup.mockResolvedValue({ success: true, recoveryKey: KEY });
      render(<UserSetupModal onComplete={vi.fn()} />);
      fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
      await screen.findByText(KEY);
    }

    it("copies the key and shows a tick for two seconds", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      await showKey();
      const copyButton = screen.getByRole("button", {
        name: "Copy recovery key",
      });
      expect(copyButton.querySelector(".lucide-copy")).not.toBeNull();

      vi.useFakeTimers({ toFake: ["setTimeout"] });
      fireEvent.click(copyButton);
      await act(async () => {});

      expect(writeText).toHaveBeenCalledWith(KEY);
      expect(copyButton.querySelector(".lucide-check")).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(copyButton.querySelector(".lucide-copy")).not.toBeNull();
    });

    it("keeps the copy icon when the clipboard refuses", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      await showKey();
      const copyButton = screen.getByRole("button", {
        name: "Copy recovery key",
      });

      fireEvent.click(copyButton);

      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      expect(writeText).toHaveBeenCalledWith(KEY);
      expect(copyButton.querySelector(".lucide-check")).toBeNull();
      expect(screen.getByText(KEY)).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });
});
