import { BrowserRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../src/api";
import ForgotPasswordPage from "../../../src/components/pages/ForgotPasswordPage";

// The page's own API calls are stubbed per test; the rest of the module
// (getErrorMessage, ApiError) is the real one
vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    forgotPasswordInit: vi.fn(),
    forgotPasswordReset: vi.fn(),
  };
});

const mockForgotPasswordInit = vi.mocked(api.forgotPasswordInit);
const mockForgotPasswordReset = vi.mocked(api.forgotPasswordReset);

/** Sends the page's requests through the real apiFetch to a stubbed fetch. */
async function routeThroughRealApi() {
  const actual = await vi.importActual<typeof api>("../../../src/api");
  mockForgotPasswordInit.mockImplementation(actual.forgotPasswordInit);
  mockForgotPasswordReset.mockImplementation(actual.forgotPasswordReset);
}

function stubFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json", ...headers },
        })
      )
    )
  );
}

const renderPage = () => {
  return render(
    <BrowserRouter>
      <ForgotPasswordPage />
    </BrowserRouter>
  );
};

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders username form initially", () => {
    renderPage();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
  });

  it("shows error when user has no recovery key", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: false });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "testuser" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(
        screen.getByText(/does not have a recovery key/)
      ).toBeInTheDocument();
    });
  });

  it("proceeds to step 2 when user has recovery key", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: true });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "testuser" },
    });
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
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "testuser" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Recovery Key")).toBeInTheDocument();
    });

    // Step 2
    fireEvent.change(screen.getByLabelText("Recovery Key"), {
      target: { value: "ABCD-1234" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
      expect(screen.getByText("Password Reset Successful")).toBeInTheDocument();
    });
  });

  it("a 429 on forgot-password shows the message and the retry time", async () => {
    await routeThroughRealApi();
    stubFetch(
      429,
      { error: "Too many authentication attempts, please try again later" },
      { "Retry-After": "840" }
    );
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "testuser" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        "Too many authentication attempts, please try again later. Try again in 14 minutes."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("a refused reset shows the server's message", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: true });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "testuser" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Recovery Key");

    await routeThroughRealApi();
    stubFetch(401, { error: "Invalid username or recovery key" });
    fireEvent.change(screen.getByLabelText("Recovery Key"), {
      target: { value: "ABCD-1234" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(
      await screen.findByText("Invalid username or recovery key")
    ).toBeInTheDocument();
  });
});
