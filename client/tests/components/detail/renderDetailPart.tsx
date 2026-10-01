/**
 * Renders one part of the shared detail layout with what it reads: a
 * router (whose location the test reads), a query client, a signed-in user
 * (an admin by default) and the card display settings.
 */
import type { ReactElement, ReactNode } from "react";
import { type Location, MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { vi } from "vitest";
import type { EntityDetail } from "@/api/hooks/useEntityDetail";
import type { DetailEntityByType, DetailType } from "@/api/library";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { CardDisplaySettingsContext } from "@/contexts/CardDisplaySettingsContext";

export type FoundDetail<T extends DetailType> = Extract<
  EntityDetail<T>,
  { status: "found" }
>;

interface Options {
  url?: string;
  /** What `getSettings(type)` answers for every type */
  settings?: Record<string, unknown>;
  role?: "ADMIN" | "USER";
}

export function renderDetailPart(ui: ReactElement, options: Options = {}) {
  const { url = "/tag/5", settings = {}, role = "ADMIN" } = options;
  const location: { current: Location | undefined } = { current: undefined };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const auth = createAuthValue({
    isAuthenticated: true,
    user: { id: 1, username: "viewer", role, setupCompleted: true },
  });
  const cardSettings = {
    getSettings: () => settings,
    updateSettings: vi.fn(),
    isLoading: false,
  };

  const LocationProbe = () => {
    location.current = useLocation();
    return null;
  };
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <CardDisplaySettingsContext.Provider value={cardSettings}>
          <MemoryRouter initialEntries={[url]}>
            {node}
            <LocationProbe />
          </MemoryRouter>
        </CardDisplaySettingsContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

  const result = render(wrap(ui));
  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(wrap(next)),
    /** The current URL's search params, as a plain object */
    search: () =>
      Object.fromEntries(new URLSearchParams(location.current?.search ?? "")),
    path: () => location.current?.pathname,
  };
}

/** A found tag, with the fields the layout reads; the rest left out */
export function foundTag(
  overrides: Partial<FoundDetail<"tag">> = {},
  entity: Partial<DetailEntityByType["tag"]> = {}
): FoundDetail<"tag"> {
  return {
    status: "found",
    entity: {
      id: "5",
      instanceId: "inst-a",
      name: "Thing",
      stashUrl: null,
      ...entity,
    } as DetailEntityByType["tag"],
    instanceId: "inst-a",
    ref: "5:inst-a",
    rating: null,
    favorite: false,
    setRating: vi.fn(),
    setFavorite: vi.fn(),
    toggleFavorite: vi.fn(),
    ...overrides,
  };
}

/** A relation-counts result: answered with `data`, or loading, or failed */
export function countsResult(state: { data?: unknown; error?: unknown } = {}) {
  return {
    data: state.data,
    error: state.error ?? null,
    refetch: vi.fn(() => Promise.resolve()),
  };
}
