/**
 * GlobalLayout reads the sidebar's navigation preferences from the one
 * settings query (item 78): a save reaches the sidebar at once, with no
 * second request and no reload.
 */
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { flushPromises } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import { useUpdateUserSettings } from "@/api/hooks/useUserSettings";
import GlobalLayout from "@/components/ui/GlobalLayout";
import { NAV_DEFINITIONS } from "@/constants/navigation";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));
vi.mock("@/hooks/useGlobalNavigation", () => ({
  useGlobalNavigation: vi.fn(),
}));
vi.mock("@/hooks/useScrollRestoration", () => ({ default: vi.fn() }));
vi.mock("@/components/ui/TVNavigator", () => ({ default: () => null }));
vi.mock("@/components/ui/TopBar", () => ({ default: () => null }));
vi.mock("@/components/ui/Sidebar", () => ({
  default: ({ navPreferences }: { navPreferences: Array<{ id: string }> }) => (
    <p data-testid="sidebar">{navPreferences.map((p) => p.id).join(",")}</p>
  ),
}));

const DEFAULT_ORDER = NAV_DEFINITIONS.map((def) => def.key).join(",");

const SWAPPED = [
  NAV_DEFINITIONS[1],
  NAV_DEFINITIONS[0],
  ...NAV_DEFINITIONS.slice(2),
]
  .map((def) => def?.key)
  .join(",");

function SaveNav() {
  const save = useUpdateUserSettings();
  const keys = SWAPPED.split(",");
  return (
    <button
      type="button"
      onClick={() =>
        save.mutate({
          navPreferences: keys.map((id, order) => ({
            id,
            enabled: true,
            order,
          })),
        })
      }
    >
      Save nav
    </button>
  );
}

const renderLayout = () =>
  render(
    <MemoryRouter>
      <SignedInWithQuery>
        <GlobalLayout>
          <SaveNav />
        </GlobalLayout>
      </SignedInWithQuery>
    </MemoryRouter>
  );

describe("GlobalLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(userSettingsResponse());
    mockApiPut.mockResolvedValue({ success: true });
  });

  it("the sidebar shows every item in order when none is stored", async () => {
    renderLayout();

    await waitFor(() =>
      expect(screen.getByTestId("sidebar")).toHaveTextContent(DEFAULT_ORDER)
    );
  });

  it("a failed settings load shows the default items", async () => {
    mockApiGet.mockRejectedValue(new Error("offline"));
    renderLayout();

    await waitFor(() =>
      expect(screen.getByTestId("sidebar")).toHaveTextContent(DEFAULT_ORDER)
    );
  });

  it("a saved navigation order reaches the sidebar without another request", async () => {
    renderLayout();
    await waitFor(() =>
      expect(screen.getByTestId("sidebar")).toHaveTextContent(DEFAULT_ORDER)
    );

    fireEvent.click(screen.getByRole("button", { name: "Save nav" }));

    await waitFor(() =>
      expect(screen.getByTestId("sidebar")).toHaveTextContent(SWAPPED)
    );
    await flushPromises();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});
