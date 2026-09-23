import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
