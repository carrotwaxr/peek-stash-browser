import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { ListControls } from "@tests/helpers/ListControls";
import { pinsAnswer } from "@tests/helpers/filterPins";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ApiMock = (...args: unknown[]) => Promise<unknown>;
const mockApiGet = vi.fn<ApiMock>();

vi.mock("../../../src/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({}),
  apiDelete: vi.fn().mockResolvedValue({}),
  libraryApi: {
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

vi.mock("../../../src/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));

vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({}),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

const count = (path: string) =>
  mockApiGet.mock.calls.filter((c) => c[0] === path).length;

const renderPage = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <ListControls artifactType="scene" totalPages={1} totalCount={0}>
          {null}
        </ListControls>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("presets share one query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({ presets: {} });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: {} });
      }
      if (url === "/user/filter-pins") return Promise.resolve(pinsAnswer());
      return Promise.resolve({});
    });
  });

  it("SearchControls and its Views menu on one page send one GET to each preset endpoint", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderPage(client);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Views/ })
      ).toBeInTheDocument();
      expect(count("/user/filter-presets")).toBeGreaterThan(0);
    });
    // Let every consumer settle
    await new Promise((r) => setTimeout(r, 50));
    expect(count("/user/filter-presets")).toBe(1);
    expect(count("/user/default-presets")).toBe(1);
  });

  it("a remount within the session sends no preset request", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const first = renderPage(client);
    await waitFor(() => {
      expect(count("/user/filter-presets")).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    first.unmount();

    renderPage(client);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Views/ })
      ).toBeInTheDocument();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(count("/user/filter-presets")).toBe(1);
    expect(count("/user/default-presets")).toBe(1);
  });
});
