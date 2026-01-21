import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

const mockForgotPasswordInit = vi.fn();
const mockForgotPasswordReset = vi.fn();

vi.mock("../../../src/services/api.js", () => ({
  forgotPasswordInit: (...args) => mockForgotPasswordInit(...args),
  forgotPasswordReset: (...args) => mockForgotPasswordReset(...args),
}));

import ForgotPasswordPage from "../../../src/components/pages/ForgotPasswordPage.jsx";

const renderPage = () => {
  return render(
    <BrowserRouter>
      <ForgotPasswordPage />
    </BrowserRouter>
  );
};

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders username form initially", () => {
    renderPage();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("shows error when user has no recovery key", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: false });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText(/does not have a recovery key/)).toBeInTheDocument();
    });
  });

  it("proceeds to step 2 when user has recovery key", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: true });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Recovery Key")).toBeInTheDocument();
    });
  });

  it("shows success message after password reset", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: true });
    mockForgotPasswordReset.mockResolvedValue({ success: true });
    renderPage();

    // Step 1
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Recovery Key")).toBeInTheDocument();
    });

    // Step 2
    fireEvent.change(screen.getByLabelText("Recovery Key"), { target: { value: "ABCD-1234" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
      expect(screen.getByText("Password Reset Successful")).toBeInTheDocument();
    });
  });
});
