import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserSetupModal from "../../../src/components/modals/UserSetupModal.jsx";

// Mock the API
vi.mock("../../../src/services/api.js", () => ({
  userSetupApi: {
    getSetupStatus: vi.fn(),
    completeSetup: vi.fn(),
  },
}));

// Mock useAuth
vi.mock("../../../src/hooks/useAuth.js", () => ({
  useAuth: () => ({
    user: { id: 1, setupCompleted: false },
    updateUser: vi.fn(),
  }),
}));

import { userSetupApi } from "../../../src/services/api.js";

describe("UserSetupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays recovery key from API", async () => {
    // Mock returns data directly (not wrapped in .data like axios)
    userSetupApi.getSetupStatus.mockResolvedValue({
      setupCompleted: false,
      recoveryKey: "ABCD-1234-EFGH-5678",
      instances: [],
      instanceCount: 1,
    });

    render(<UserSetupModal onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/ABCD-1234-EFGH-5678/)).toBeInTheDocument();
    });
  });

  it("shows instance selection when multiple instances exist", async () => {
    userSetupApi.getSetupStatus.mockResolvedValue({
      setupCompleted: false,
      recoveryKey: "ABCD-1234-EFGH-5678",
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
  });

  it("hides instance selection when only one instance exists", async () => {
    userSetupApi.getSetupStatus.mockResolvedValue({
      setupCompleted: false,
      recoveryKey: "ABCD-1234-EFGH-5678",
      instances: [{ id: "inst-1", name: "Main", description: "" }],
      instanceCount: 1,
    });

    render(<UserSetupModal onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/ABCD-1234-EFGH-5678/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Content Sources")).not.toBeInTheDocument();
  });

  it("calls completeSetup and onComplete when clicking Get Started", async () => {
    const onComplete = vi.fn();
    userSetupApi.getSetupStatus.mockResolvedValue({
      setupCompleted: false,
      recoveryKey: "ABCD-1234-EFGH-5678",
      instances: [],
      instanceCount: 1,
    });
    userSetupApi.completeSetup.mockResolvedValue({ success: true });

    render(<UserSetupModal onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("Get Started")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Get Started"));

    await waitFor(() => {
      expect(userSetupApi.completeSetup).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
