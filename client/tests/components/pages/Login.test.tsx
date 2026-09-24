/**
 * The login page's one-time notice (sweep item 2): a message stored by
 * redirectToLogin is shown once and cleared.
 */
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/components/pages/Login";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ login: vi.fn() })),
}));

vi.mock("@/themes/useTheme", () => ({
  useTheme: vi.fn(() => ({ theme: { properties: {} } })),
}));

describe("Login", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows the stored login message once and clears it", () => {
    sessionStorage.setItem(
      "peek_login_message",
      "Your session expired while the video was paused. Log in to keep watching."
    );

    renderWithProviders(<Login />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session expired while the video was paused. Log in to keep watching."
    );
    expect(sessionStorage.getItem("peek_login_message")).toBeNull();
  });

  it("renders no notice when nothing is stored", () => {
    renderWithProviders(<Login />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
