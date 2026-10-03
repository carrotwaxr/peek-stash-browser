import { type ComponentProps, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { pinsAnswer } from "@tests/helpers/filterPins";
import { queryKeys } from "@/api/queryKeys";

/**
 * A MemoryRouter inside a fresh QueryClient, for rendering list controls whose
 * preset queries need a client (SearchControls, ViewsMenu, useListUrlState).
 * The client lives as long as the mounted router, so a remount starts empty
 * but for the user's filter pins, seeded as none.
 */
export function MemoryRouterWithQuery(
  props: ComponentProps<typeof MemoryRouter>
) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(queryKeys.user.filterPins(), pinsAnswer());
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter {...props} />
    </QueryClientProvider>
  );
}
