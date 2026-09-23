import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupApi } from "../../../src/api";
import SetupWizard from "../../../src/components/pages/SetupWizard";

// The wizard's Stash step needs the admin session (sweep item 7): coming back
// to it later asks the admin to sign in first.

const { authState, mockLogin } = vi.hoisted(() => ({
  authState: { isAuthenticated: false, isLoading: false },
  mockLogin: vi.fn(),
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
  useTheme: () => ({ theme: undefined }),
}));

vi.mock("../../../src/api", () => ({
  setupApi: {
    createFirstAdmin: vi.fn(),
    testStashConnection: vi.fn(),
    createFirstStashInstance: vi.fn(),
  },
}));

const mockCreateFirstAdmin = vi.mocked(setupApi.createFirstAdmin);

const STASH_URL_PLACEHOLDER = "http://localhost:9999/graphql";

describe("SetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
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
    mockLogin.mockImplementation(async () => {
      authState.isAuthenticated = true;
      return { success: true };
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
});
