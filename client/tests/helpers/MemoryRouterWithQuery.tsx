import { type ComponentProps, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A MemoryRouter inside a fresh QueryClient, for rendering list controls whose
 * preset queries need a client (SearchControls, FilterPresets, useListUrlState).
 * The client lives as long as the mounted router, so a remount starts empty.
 */
export function MemoryRouterWithQuery(
  props: ComponentProps<typeof MemoryRouter>
) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter {...props} />
    </QueryClientProvider>
  );
}
