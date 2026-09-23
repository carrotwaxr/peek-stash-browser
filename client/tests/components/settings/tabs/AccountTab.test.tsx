import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecoveryKey, regenerateRecoveryKey } from "../../../../src/api";
import AccountTab from "../../../../src/components/settings/tabs/AccountTab";
import { showError } from "../../../../src/utils/toast";

vi.mock("../../../../src/api", () => ({
  getRecoveryKey: vi.fn(),
  regenerateRecoveryKey: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("../../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const mockGetRecoveryKey = vi.mocked(getRecoveryKey);
const mockRegenerateRecoveryKey = vi.mocked(regenerateRecoveryKey);

const NEW_KEY = "ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456";
const KEY_PATTERN = /^([A-Z2-9]{4}-){6}[A-Z2-9]{4}$/;

describe("AccountTab recovery key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says a key exists without showing one", async () => {
    mockGetRecoveryKey.mockResolvedValue({ hasRecoveryKey: true });

    render(<AccountTab />);

    expect(
      await screen.findByText("A recovery key is set.")
    ).toBeInTheDocument();
    expect(screen.queryByText(KEY_PATTERN)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create new key" })
    ).toBeInTheDocument();
  });

  it("creates a key only with the current password and shows it once", async () => {
    mockGetRecoveryKey.mockResolvedValue({ hasRecoveryKey: true });
    mockRegenerateRecoveryKey.mockResolvedValue({ recoveryKey: NEW_KEY });

    render(<AccountTab />);

    const passwordInput = await screen.findByLabelText(
      "Confirm with your current password"
    );
    const createButton = screen.getByRole("button", { name: "Create new key" });
    expect(createButton).toBeDisabled();

    fireEvent.change(passwordInput, { target: { value: "OldPass1" } });
    fireEvent.click(createButton);

    expect(await screen.findByText(NEW_KEY)).toBeInTheDocument();
    expect(mockRegenerateRecoveryKey).toHaveBeenCalledWith("OldPass1");
    expect(
      screen.getByText("Save this key now. Peek won't show it again.")
    ).toBeInTheDocument();
    expect(passwordInput).toHaveValue("");
  });

  it("shows the server error when the password is wrong", async () => {
    mockGetRecoveryKey.mockResolvedValue({ hasRecoveryKey: false });
    mockRegenerateRecoveryKey.mockRejectedValue(
      new Error("Current password is incorrect")
    );

    render(<AccountTab />);

    expect(
      await screen.findByText("You don't have a recovery key yet.")
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Confirm with your current password"),
      { target: { value: "wrong" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Current password is incorrect");
    });
    expect(screen.queryByText(KEY_PATTERN)).not.toBeInTheDocument();
  });
});
