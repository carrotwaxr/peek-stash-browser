/**
 * The Studios page on the list page shell: its title, its error and
 * initializing states, its cards and its stale results. The list hook is
 * mocked; the controls and pagination are the real ones.
 */
import { screen } from "@testing-library/react";
import { renderListPage } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import type * as ApiHooks from "@/api/hooks";
import Studios from "@/components/pages/Studios";
import { usePageTitle } from "@/hooks/usePageTitle";

interface MockListResult {
  data: Record<string, unknown> | undefined;
  isPending: boolean;
  error: Error | null;
  isPlaceholderData: boolean;
  refetch: () => void;
}

const { mockList } = vi.hoisted(() => ({
  mockList: vi.fn<(params: unknown) => MockListResult>(),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiHooks>()),
  useStudioList: (params: unknown) => mockList(params),
}));
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  libraryApi: {},
}));
// Shows itself while the library is initializing (its own test covers when)
vi.mock("@/components/ui/LibraryInitializingBanner", () => ({
  default: () => <div data-testid="sync-banner" />,
}));
vi.mock("@/components/cards/index", () => ({
  StudioCard: (props: { studio: { name: string } }) => (
    <div data-testid="studio-card">{props.studio.name}</div>
  ),
}));

const result = (fields: Partial<MockListResult> = {}): MockListResult => ({
  data: undefined,
  isPending: false,
  error: null,
  isPlaceholderData: false,
  refetch: vi.fn(),
  ...fields,
});

const renderPage = () =>
  renderListPage(<Studios />, { initialEntries: ["/studios"] });

describe("Studios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockReturnValue(
      result({ data: { findStudios: { studios: [], count: 0 } } })
    );
  });

  describe("Rendering", () => {
    it("sets page title to 'Studios'", () => {
      renderPage();
      expect(usePageTitle).toHaveBeenCalledWith("Studios");
    });

    it("shows the heading 'Studios' and its controls", () => {
      renderPage();
      expect(
        screen.getByRole("heading", { name: "Studios" })
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("shows ErrorMessage when error is present and not initializing", () => {
      mockList.mockReturnValue(
        result({ error: new ApiError("Something went wrong", 500) })
      );

      renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("an initializing 503 shows the sync banner, not the error page", () => {
      mockList.mockReturnValue(
        result({ error: new ApiError("init", 503, { ready: false }) })
      );

      renderPage();
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("renders loading skeletons when loading", () => {
      mockList.mockReturnValue(result({ isPending: true }));

      renderPage();
      expect(screen.getAllByTestId("list-skeleton").length).toBeGreaterThan(0);
    });
  });

  describe("Data State", () => {
    it("renders StudioCard when data is present", () => {
      mockList.mockReturnValue(
        result({
          data: {
            findStudios: {
              studios: [
                { id: "1", instanceId: "a", name: "Test Studio" },
                { id: "2", instanceId: "a", name: "Another Studio" },
              ],
              count: 2,
            },
          },
        })
      );

      renderPage();
      const cards = screen.getAllByTestId("studio-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Test Studio");
    });
  });

  describe("Stale results", () => {
    it("dims the results while the list shows placeholder data", () => {
      mockList.mockReturnValue(
        result({
          data: { findStudios: { studios: [], count: 0 } },
          isPlaceholderData: true,
        })
      );

      renderPage();
      expect(screen.getByTestId("search-results")).toHaveAttribute(
        "aria-busy",
        "true"
      );
    });
  });
});
