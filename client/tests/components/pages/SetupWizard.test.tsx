import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupApi } from "../../../src/api";
import SetupWizard from "../../../src/components/pages/SetupWizard";

// The wizard's Stash step needs the admin session (sweep item 7): coming back
// to it later asks the admin to sign in first.

const { authState, mockLogin, themeState } = vi.hoisted(() => ({
  authState: { isAuthenticated: false, isLoading: false },
  mockLogin: vi.fn(),
  themeState: {
    theme: undefined as
      | { name: string; properties: Record<string, string> }
      | undefined,
  },
}));

vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    ...authState,
    user: null,
    login: mockLogin,
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("../../../src/themes/useTheme", () => ({
  useTheme: () => ({ theme: themeState.theme }),
}));

vi.mock("../../../src/api", () => ({
  setupApi: {
    createFirstAdmin: vi.fn(),
    testStashConnection: vi.fn(),
    createFirstStashInstance: vi.fn(),
  },
}));

const mockCreateFirstAdmin = vi.mocked(setupApi.createFirstAdmin);
const mockTestStashConnection = vi.mocked(setupApi.testStashConnection);
const mockCreateFirstStashInstance = vi.mocked(
  setupApi.createFirstStashInstance
);

const ADMIN_CREATED = {
  success: true as const,
  user: { id: 1, username: "admin", role: "ADMIN", createdAt: new Date() },
};

const STASH_CREATED = {
  success: true as const,
  instance: {
    id: "inst-1",
    name: "Default",
    url: "http://stash:9999/graphql",
    uiUrl: null,
    enabled: true,
    createdAt: new Date(),
  },
};

const THEME = {
  name: "Test",
  properties: {
    "--text-primary": "rgb(1, 1, 1)",
    "--text-secondary": "rgb(2, 2, 2)",
    "--text-muted": "rgb(3, 3, 3)",
    "--bg-primary": "rgb(4, 4, 4)",
    "--bg-secondary": "rgb(5, 5, 5)",
    "--bg-card": "rgb(6, 6, 6)",
    "--border-color": "rgb(7, 7, 7)",
    "--accent-color": "rgb(8, 8, 8)",
  },
};

const typePasswords = (password: string, confirm = password) => {
  fireEvent.change(screen.getByPlaceholderText("Enter password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Admin User" }));
};

const fillStash = (url = "http://stash:9999/graphql", key = "KEY") => {
  fireEvent.change(screen.getByPlaceholderText(STASH_URL_PLACEHOLDER), {
    target: { value: url },
  });
  fireEvent.change(screen.getByPlaceholderText("Your Stash API key"), {
    target: { value: key },
  });
};

const renderAt = (
  setupStatus: { hasUsers: boolean; hasStashInstance: boolean } | null,
  onSetupComplete = vi.fn()
) => {
  render(
    <SetupWizard setupStatus={setupStatus} onSetupComplete={onSetupComplete} />
  );
  return onSetupComplete;
};

const STASH_URL_PLACEHOLDER = "http://localhost:9999/graphql";

describe("SetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    themeState.theme = undefined;
    vi.restoreAllMocks();
  });

  it("resuming at the Stash step without a session asks the admin to sign in first", async () => {
    mockLogin.mockResolvedValue({ success: true });

    render(
      <SetupWizard
        setupStatus={{ hasUsers: true, hasStashInstance: false }}
        onSetupComplete={vi.fn()}
      />
    );

    expect(
      screen.getByText("Sign in as the admin to finish setup")
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(STASH_URL_PLACEHOLDER)
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "AdminPass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        username: "admin",
        password: "AdminPass1",
      });
    });
  });

  it("shows the Stash step when the admin is signed in", () => {
    authState.isAuthenticated = true;

    render(
      <SetupWizard
        setupStatus={{ hasUsers: true, hasStashInstance: false }}
        onSetupComplete={vi.fn()}
      />
    );

    expect(
      screen.getByPlaceholderText(STASH_URL_PLACEHOLDER)
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sign in as the admin to finish setup")
    ).not.toBeInTheDocument();
  });

  it("creating the admin moves to the Stash step signed in", async () => {
    mockCreateFirstAdmin.mockResolvedValue({
      success: true,
      user: { id: 1, username: "admin", role: "ADMIN", createdAt: new Date() },
    });
    mockLogin.mockImplementation(() => {
      authState.isAuthenticated = true;
      return Promise.resolve({ success: true });
    });

    render(
      <SetupWizard
        setupStatus={{ hasUsers: false, hasStashInstance: false }}
        onSetupComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
    fireEvent.change(screen.getByPlaceholderText("Enter password"), {
      target: { value: "AdminPass1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "AdminPass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Admin User" }));

    expect(
      await screen.findByPlaceholderText(STASH_URL_PLACEHOLDER)
    ).toBeInTheDocument();
    expect(mockCreateFirstAdmin).toHaveBeenCalledWith("admin", "AdminPass1");
    expect(mockLogin).toHaveBeenCalledWith({
      username: "admin",
      password: "AdminPass1",
    });
  });

  describe("signing in to finish", () => {
    it("shows the server's reason when sign-in fails", async () => {
      mockLogin.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });
      renderAt({ hasUsers: true, hasStashInstance: false });

      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      expect(
        await screen.findByText("Invalid credentials")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });

    it("shows a generic message when sign-in fails without a reason", async () => {
      mockLogin.mockResolvedValue({ success: false });
      renderAt({ hasUsers: true, hasStashInstance: false });

      fireEvent.change(screen.getByLabelText("Username"), {
        target: { value: "root" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText("Sign in failed")).toBeInTheDocument();
      expect(mockLogin).toHaveBeenCalledWith({
        username: "root",
        password: "wrong",
      });
    });

    it("shows the error when sign-in throws", async () => {
      mockLogin.mockRejectedValue(new Error("Too many attempts"));
      renderAt({ hasUsers: true, hasStashInstance: false });

      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    });

    it("falls back to a generic message when the thrown error has none", async () => {
      mockLogin.mockRejectedValue(new Error(""));
      renderAt({ hasUsers: true, hasStashInstance: false });

      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText("Sign in failed")).toBeInTheDocument();
    });

    it("keeps Sign in disabled until both fields are filled", () => {
      renderAt({ hasUsers: true, hasStashInstance: false });

      expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "x" },
      });
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
      fireEvent.change(screen.getByLabelText("Username"), {
        target: { value: "" },
      });
      expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    });
  });

  describe("creating the admin", () => {
    const openAdminStep = () => {
      renderAt({ hasUsers: false, hasStashInstance: false });
      fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
    };

    it.each([
      ["AdminPass1", "AdminPass2", "Passwords do not match"],
      ["Short1", "Short1", "Password must be at least 8 characters"],
      ["12345678", "12345678", "Password must contain at least one letter"],
      ["abcdefgh", "abcdefgh", "Password must contain at least one number"],
    ])(
      "rejects %s / %s before calling the server",
      (password, confirm, message) => {
        openAdminStep();
        typePasswords(password, confirm);

        expect(screen.getByText(message)).toBeInTheDocument();
        expect(mockCreateFirstAdmin).not.toHaveBeenCalled();
      }
    );

    it("reports a refused admin creation", async () => {
      mockCreateFirstAdmin.mockResolvedValue({ success: false } as never);
      openAdminStep();
      typePasswords("AdminPass1");

      expect(
        await screen.findByText("Failed to create admin user")
      ).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("reports the server's error when admin creation throws", async () => {
      mockCreateFirstAdmin.mockRejectedValue(new Error("Admin exists"));
      openAdminStep();
      typePasswords("AdminPass1");

      expect(
        await screen.findByText("Failed to create admin user: Admin exists")
      ).toBeInTheDocument();
    });

    it("reports an unknown error when the thrown error has no message", async () => {
      mockCreateFirstAdmin.mockRejectedValue(new Error(""));
      openAdminStep();
      typePasswords("AdminPass1");

      expect(
        await screen.findByText("Failed to create admin user: Unknown error")
      ).toBeInTheDocument();
    });

    it("moves on to sign in when the automatic sign-in fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCreateFirstAdmin.mockResolvedValue(ADMIN_CREATED);
      mockLogin.mockResolvedValue({ success: false, error: "nope" });
      openAdminStep();
      typePasswords("AdminPass1");

      expect(
        await screen.findByText("Sign in as the admin to finish setup")
      ).toBeInTheDocument();
      expect(console.warn).toHaveBeenCalled();
    });

    it("moves on to sign in when the automatic sign-in throws", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCreateFirstAdmin.mockResolvedValue(ADMIN_CREATED);
      mockLogin.mockRejectedValue(new Error("network"));
      openAdminStep();
      typePasswords("AdminPass1");

      expect(
        await screen.findByText("Sign in as the admin to finish setup")
      ).toBeInTheDocument();
    });

    it("skips the Stash step when an instance is already configured", async () => {
      mockCreateFirstAdmin.mockResolvedValue(ADMIN_CREATED);
      mockLogin.mockResolvedValue({ success: true });
      const onSetupComplete = renderAt({
        hasUsers: false,
        hasStashInstance: true,
      });
      fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
      typePasswords("AdminPass1");

      expect(await screen.findByText("Setup Complete!")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Start Browsing" }));
      expect(onSetupComplete).toHaveBeenCalled();
    });

    it("Back returns to the welcome step", () => {
      openAdminStep();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(
        screen.getByText("Welcome to Peek Stash Browser")
      ).toBeInTheDocument();
    });
  });

  describe("connecting to Stash", () => {
    beforeEach(() => {
      authState.isAuthenticated = true;
    });

    it("tests the connection, saves it and completes setup", async () => {
      mockTestStashConnection.mockResolvedValue({ success: true });
      mockCreateFirstStashInstance.mockResolvedValue(STASH_CREATED);
      const onSetupComplete = renderAt({
        hasUsers: true,
        hasStashInstance: false,
      });

      expect(
        screen.getByText("Resuming setup - admin account already exists")
      ).toBeInTheDocument();
      const save = screen.getByRole("button", { name: "Save & Continue" });
      expect(save).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Test Connection" })
      ).toBeDisabled();

      fillStash();
      fireEvent.change(
        screen.getByPlaceholderText("https://stash.example.com"),
        { target: { value: "https://stash.example.com" } }
      );
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(
        await screen.findByText("Connection successful!")
      ).toBeInTheDocument();
      expect(mockTestStashConnection).toHaveBeenCalledWith(
        "http://stash:9999/graphql",
        "KEY"
      );
      expect(save).toBeEnabled();

      fireEvent.click(save);

      expect(await screen.findByText("Setup Complete!")).toBeInTheDocument();
      expect(mockCreateFirstStashInstance).toHaveBeenCalledWith(
        "http://stash:9999/graphql",
        "KEY",
        "Default",
        "https://stash.example.com"
      );
      fireEvent.click(screen.getByRole("button", { name: "Start Browsing" }));
      expect(onSetupComplete).toHaveBeenCalled();
    });

    it("editing the URL or key after a good test asks for a new test", async () => {
      mockTestStashConnection.mockResolvedValue({ success: true });
      renderAt({ hasUsers: true, hasStashInstance: false });

      fillStash();
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
      await screen.findByText("Connection successful!");

      fireEvent.change(screen.getByPlaceholderText(STASH_URL_PLACEHOLDER), {
        target: { value: "http://other:9999/graphql" },
      });
      expect(
        screen.queryByText("Connection successful!")
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save & Continue" })
      ).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
      await screen.findByText("Connection successful!");
      fireEvent.change(screen.getByPlaceholderText("Your Stash API key"), {
        target: { value: "OTHER" },
      });
      expect(
        screen.queryByText("Connection successful!")
      ).not.toBeInTheDocument();
    });

    it.each([
      [{ success: false, error: "Bad API key" }, "Bad API key"],
      [{ success: false }, "Connection test failed"],
    ])("shows a failed test result %o", async (response, message) => {
      mockTestStashConnection.mockResolvedValue(response);
      renderAt({ hasUsers: true, hasStashInstance: false });

      fillStash();
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save & Continue" })
      ).toBeDisabled();
    });

    it.each([
      [
        { data: { error: "ECONNREFUSED" }, message: "HTTP 400" },
        "ECONNREFUSED",
      ],
      [{ message: "Network down" }, "Network down"],
      [{}, "Connection test failed"],
    ])("shows a thrown test error %o", async (err, message) => {
      mockTestStashConnection.mockRejectedValue(err);
      renderAt({ hasUsers: true, hasStashInstance: false });

      fillStash();
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it.each([
      [
        "resolves unsuccessful",
        { success: false },
        "Failed to save Stash configuration",
      ],
      [
        "throws with a server error",
        { data: { error: "Instance exists" } },
        "Instance exists",
      ],
      ["throws with a message", { message: "Timeout" }, "Timeout"],
      ["throws with nothing", {}, "Failed to save Stash configuration"],
    ])(
      "stays on the Stash step when saving %s",
      async (_label, outcome, message) => {
        mockTestStashConnection.mockResolvedValue({ success: true });
        if ("success" in outcome) {
          mockCreateFirstStashInstance.mockResolvedValue(outcome as never);
        } else {
          mockCreateFirstStashInstance.mockRejectedValue(outcome);
        }
        renderAt({ hasUsers: true, hasStashInstance: false });

        fillStash();
        fireEvent.click(
          screen.getByRole("button", { name: "Test Connection" })
        );
        await screen.findByText("Connection successful!");
        fireEvent.click(
          screen.getByRole("button", { name: "Save & Continue" })
        );

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.queryByText("Setup Complete!")).not.toBeInTheDocument();
        expect(
          screen.getByPlaceholderText(STASH_URL_PLACEHOLDER)
        ).toBeInTheDocument();
      }
    );

    it("Back returns to the admin step and clears the error", async () => {
      mockTestStashConnection.mockResolvedValue({
        success: false,
        error: "Bad API key",
      });
      renderAt({ hasUsers: true, hasStashInstance: false });
      fillStash();
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
      await screen.findByText("Bad API key");

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(screen.getByText("Create Admin Account")).toBeInTheDocument();
      expect(screen.queryByText("Bad API key")).not.toBeInTheDocument();
    });

    it("shows the Stash step while the session is still being checked", () => {
      authState.isAuthenticated = false;
      authState.isLoading = true;
      renderAt({ hasUsers: true, hasStashInstance: false });

      expect(
        screen.getByPlaceholderText(STASH_URL_PLACEHOLDER)
      ).toBeInTheDocument();
    });
  });

  it("opens at Complete when setup is already done, without the progress bar", () => {
    const onSetupComplete = renderAt({
      hasUsers: true,
      hasStashInstance: true,
    });

    expect(screen.getByText("Setup Complete!")).toBeInTheDocument();
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Browsing" }));
    expect(onSetupComplete).toHaveBeenCalled();
  });

  it("starts at Welcome without a setup status", () => {
    renderAt(null);

    expect(
      screen.getByText("Welcome to Peek Stash Browser")
    ).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toHaveClass("font-semibold");
    expect(screen.getByText("Complete")).not.toHaveClass("font-semibold");
  });

  describe("theme colours", () => {
    beforeEach(() => {
      themeState.theme = THEME;
    });

    it("paints every step in the active theme's colours", async () => {
      mockCreateFirstAdmin.mockResolvedValue(ADMIN_CREATED);
      mockLogin.mockImplementation(() => {
        authState.isAuthenticated = true;
        return Promise.resolve({ success: true });
      });
      mockTestStashConnection.mockResolvedValue({ success: true });
      mockCreateFirstStashInstance.mockResolvedValue(STASH_CREATED);
      const { container } = render(
        <SetupWizard
          setupStatus={{ hasUsers: false, hasStashInstance: false }}
          onSetupComplete={vi.fn()}
        />
      );

      // Page and progress
      expect(container.firstChild).toHaveStyle({
        backgroundColor: "rgb(4, 4, 4)",
      });
      expect(screen.getByText("Welcome")).toHaveStyle({
        color: "rgb(8, 8, 8)",
      });
      expect(screen.getByText("Complete")).toHaveStyle({
        color: "rgb(2, 2, 2)",
      });

      // Welcome
      expect(screen.getByText("Welcome to Peek Stash Browser")).toHaveStyle({
        color: "rgb(1, 1, 1)",
      });
      expect(screen.getByText("Before you begin:")).toHaveStyle({
        color: "rgb(1, 1, 1)",
      });
      fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

      // Admin, with an error
      expect(screen.getByText("Create Admin Account")).toHaveStyle({
        color: "rgb(1, 1, 1)",
      });
      expect(
        screen.getByText(
          "8+ characters with at least one letter and one number"
        )
      ).toHaveStyle({ color: "rgb(3, 3, 3)" });
      expect(screen.getByPlaceholderText("Enter password")).toHaveStyle({
        backgroundColor: "rgb(6, 6, 6)",
      });
      expect(screen.getByDisplayValue("admin")).toHaveStyle({
        backgroundColor: "rgb(5, 5, 5)",
      });
      typePasswords("AdminPass1", "Mismatch1");
      expect(
        screen.getByText("Passwords do not match").parentElement
      ).toHaveStyle({ backgroundColor: "rgb(6, 6, 6)" });
      typePasswords("AdminPass1");

      // Stash, with an error and then a good test
      await screen.findByPlaceholderText(STASH_URL_PLACEHOLDER);
      expect(
        screen.getByText("Connect to Stash", { selector: "h2" })
      ).toHaveStyle({
        color: "rgb(1, 1, 1)",
      });
      expect(screen.getByPlaceholderText(STASH_URL_PLACEHOLDER)).toHaveStyle({
        backgroundColor: "rgb(6, 6, 6)",
      });
      expect(screen.getByText(/Found in Stash Settings/)).toHaveStyle({
        color: "rgb(2, 2, 2)",
      });
      mockTestStashConnection.mockResolvedValueOnce({
        success: false,
        error: "Bad API key",
      });
      fillStash();
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
      expect(
        (await screen.findByText("Bad API key")).parentElement
      ).toHaveStyle({ backgroundColor: "rgb(6, 6, 6)" });
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
      expect(
        (await screen.findByText("Connection successful!")).parentElement
      ).toHaveStyle({ backgroundColor: "rgb(6, 6, 6)" });
      fireEvent.click(screen.getByRole("button", { name: "Save & Continue" }));

      // Complete
      expect(await screen.findByText("Setup Complete!")).toHaveStyle({
        color: "rgb(1, 1, 1)",
      });
      expect(screen.getByText("✓")).toHaveStyle({ color: "rgb(8, 8, 8)" });
    });

    it("paints the resume notice in the theme's colours", () => {
      authState.isAuthenticated = true;
      renderAt({ hasUsers: true, hasStashInstance: false });

      const notice = screen.getByText(
        "Resuming setup - admin account already exists"
      );
      expect(notice).toHaveStyle({ color: "rgb(1, 1, 1)" });
      expect(notice.parentElement).toHaveStyle({
        backgroundColor: "rgb(6, 6, 6)",
      });
    });
  });
});
