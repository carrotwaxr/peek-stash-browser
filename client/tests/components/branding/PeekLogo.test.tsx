/**
 * The logo leads to the user's landing page, read from the user-settings
 * query: a landing page saved in Settings applies at once, without a reload
 * (item 52).
 */
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import { PeekLogo } from "@/components/branding/PeekLogo";
import NavigationTab from "@/components/settings/tabs/NavigationTab";

const { mockApiGet, mockApiPut, mockGetCarousels } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
  mockGetCarousels: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    apiGet: mockApiGet,
    apiPut: mockApiPut,
    libraryApi: { ...actual.libraryApi, getCarousels: mockGetCarousels },
  };
});

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// The nav rows' icons read the theme; no ThemeProvider here
vi.mock("@/components/icons/index", () => ({
  ThemedIcon: () => null,
}));

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

describe("PeekLogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(userSettingsResponse());
    mockApiPut.mockResolvedValue({ success: true });
    mockGetCarousels.mockResolvedValue({ carousels: [] });
  });

  it("after the landing page is changed to Performers, the logo links to /performers", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SignedInWithQuery>
          <header data-testid="top-bar">
            <PeekLogo />
          </header>
          <NavigationTab />
          <Location />
        </SignedInWithQuery>
      </MemoryRouter>
    );
    const title = await screen.findByRole("heading", {
      name: "Landing Page After Login",
    });
    const landing = must(title.closest<HTMLElement>(".p-6"), "landing page");

    fireEvent.click(within(landing).getByRole("radio", { name: "Performers" }));
    fireEvent.click(within(landing).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith("/user/settings", {
        landingPagePreference: { pages: ["performers"], randomize: false },
      })
    );
    // The editor marks the change saved once the save resolves
    await waitFor(() =>
      expect(
        within(landing).queryByRole("button", { name: "Save" })
      ).not.toBeInTheDocument()
    );

    fireEvent.click(within(screen.getByTestId("top-bar")).getByRole("link"));

    expect(screen.getByTestId("location")).toHaveTextContent("/performers");
  });
});
