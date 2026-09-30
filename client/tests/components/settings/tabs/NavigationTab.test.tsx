/**
 * NavigationTab: the landing-page, navigation and carousel editors save
 * through the tab (CS-21). A failed save is reported once, by the tab, and
 * the editor keeps its changes marked unsaved; a failed load offers Retry
 * and no editor, so nothing is saved over settings that never loaded.
 */
import { MemoryRouter } from "react-router-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../src/api";
import NavigationTab from "../../../../src/components/settings/tabs/NavigationTab";
import { showError, showSuccess } from "../../../../src/utils/toast";
import { flushPromises, must } from "../../../testUtils";

const { mockApiGet, mockApiPut, mockGetCarousels } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
  mockGetCarousels: vi.fn(),
}));

// The tab's calls are stubbed; the rest (ApiError, getErrorMessage) is real
vi.mock("../../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    apiGet: mockApiGet,
    apiPut: mockApiPut,
    libraryApi: { ...actual.libraryApi, getCarousels: mockGetCarousels },
  };
});

vi.mock("../../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// The nav rows' icons read the theme; no ThemeProvider here
vi.mock("../../../../src/components/icons/index", () => ({
  ThemedIcon: () => null,
}));

const renderTab = () =>
  render(
    <MemoryRouter>
      <SignedInWithQuery>
        <NavigationTab />
      </SignedInWithQuery>
    </MemoryRouter>
  );

/** One editor's card, found by its heading. */
async function section(heading: string): Promise<HTMLElement> {
  const title = await screen.findByRole("heading", { name: heading });
  return must(title.closest<HTMLElement>(".p-6"), `${heading} section`);
}

describe("NavigationTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(userSettingsResponse());
    mockGetCarousels.mockResolvedValue({ carousels: [] });
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
  });

  describe("a failed navigation, landing-page or carousel save keeps the changes marked unsaved", () => {
    it("navigation", async () => {
      renderTab();
      const nav = await section("Navigation Menu");

      // The editor fills its list in an effect after the heading shows
      fireEvent.click(
        must(
          (await within(nav).findAllByRole("button", { name: "Move down" }))[0]
        )
      );
      const save = within(nav).getByRole("button", { name: "Save Changes" });
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() =>
        expect(showError).toHaveBeenCalledWith("Database busy")
      );
      await flushPromises();
      expect(showError).toHaveBeenCalledTimes(1);
      expect(showSuccess).not.toHaveBeenCalled();
      expect(save).toBeEnabled();
      expect(within(nav).getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("landing page", async () => {
      renderTab();
      const landing = await section("Landing Page After Login");

      fireEvent.click(within(landing).getByRole("radio", { name: "Scenes" }));
      fireEvent.click(within(landing).getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(showError).toHaveBeenCalledWith("Database busy")
      );
      await flushPromises();
      expect(showSuccess).not.toHaveBeenCalled();
      expect(
        within(landing).getByRole("button", { name: "Save" })
      ).toBeInTheDocument();
      expect(
        within(landing).getByRole("radio", { name: "Scenes" })
      ).toBeChecked();
    });

    it("carousel", async () => {
      renderTab();
      const carousels = await section("Homepage Carousels");

      fireEvent.click(
        must(
          (
            await within(carousels).findAllByRole("button", {
              name: "Hide carousel",
            })
          )[0]
        )
      );
      const save = within(carousels).getByRole("button", {
        name: "Save Changes",
      });
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() =>
        expect(showError).toHaveBeenCalledWith("Database busy")
      );
      await flushPromises();
      expect(showError).toHaveBeenCalledTimes(1);
      expect(showSuccess).not.toHaveBeenCalled();
      expect(save).toBeEnabled();
    });
  });

  it("a saved carousel change is no longer marked unsaved", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    renderTab();
    const carousels = await section("Homepage Carousels");

    fireEvent.click(
      must(
        (
          await within(carousels).findAllByRole("button", {
            name: "Hide carousel",
          })
        )[0]
      )
    );
    const save = within(carousels).getByRole("button", {
      name: "Save Changes",
    });
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(showSuccess).toHaveBeenCalledWith(
      "Carousel preferences saved successfully!"
    );
    expect(showError).not.toHaveBeenCalled();
    expect(mockApiPut).toHaveBeenCalledTimes(1);
  });

  it("a failed navigation settings load offers Retry and no editor", async () => {
    mockApiGet
      .mockRejectedValueOnce(new api.ApiError("Database busy", 503))
      .mockResolvedValueOnce(
        userSettingsResponse({
          landingPagePreference: { pages: ["tags"], randomize: false },
        })
      );
    renderTab();

    expect(await screen.findByText("Database busy")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Navigation Menu" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Save/ })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    const landing = await section("Landing Page After Login");
    expect(within(landing).getByRole("radio", { name: "Tags" })).toBeChecked();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Database busy")).not.toBeInTheDocument();
  });
});
