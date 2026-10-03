/**
 * A list's controls as a page holds them (`ListControls`), at a URL, with
 * the presets seeded in the query cache: what the page is asked for, the
 * URL and each navigation's history action. The filter-bar tests drive the
 * chips and their editors through it; the calling file mocks `@/api`.
 */
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { FilterPreset } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import {
  ListControls,
  type ListControlsProps,
} from "@tests/helpers/ListControls";
import { must } from "@tests/testUtils";
import { expect, vi } from "vitest";
import {
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";

type OnQueryChange = (query: Record<string, unknown>) => void;

export interface RenderListOptions {
  url?: string;
  presets?: Record<string, FilterPreset[]>;
  defaults?: Record<string, string>;
}

export function renderListControls(
  props: Partial<ListControlsProps> = {},
  { url = "/scenes", presets = {}, defaults = {} }: RenderListOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(presetsQueryOptions.queryKey, { presets });
  queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, { defaults });
  const onQueryChange = vi.fn<OnQueryChange>();
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <ListControls
            artifactType="scene"
            totalPages={10}
            totalCount={240}
            {...props}
            onQueryChange={onQueryChange}
          >
            {props.children ?? null}
          </ListControls>
        ),
      },
    ],
    { initialEntries: [url] }
  );
  const actions: string[] = [];
  let last = router.state.location;
  router.subscribe((next) => {
    if (next.location === last) return;
    last = next.location;
    actions.push(next.historyAction);
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    onQueryChange,
    router,
    actions,
    params: () => new URLSearchParams(router.state.location.search),
    /** The last query the page was asked for */
    lastQuery: () =>
      must(onQueryChange.mock.lastCall, "a query sent to the page")[0],
    /** Goes one entry back, as the browser's Back does */
    back: () => act(() => router.navigate(-1)),
    /** Waits for the page's first query */
    firstQuery: async () => {
      await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
      return must(onQueryChange.mock.calls[0], "the first query")[0];
    },
  };
}
