/**
 * CarouselBuilder saves through the carousel mutation: the save marks the
 * carousel list and every carousel's scenes stale, so Home asks for them
 * again (an edited rule set shows its new scenes at once).
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import CarouselBuilder from "@/components/carousel-builder/CarouselBuilder";
import { jsonResponse, requestsTo, stubApi } from "../../helpers/stubApi";

const CAROUSEL = {
  id: "c1",
  userId: 1,
  title: "Highly rated",
  icon: "Film",
  rules: { rating100: { value: 79, modifier: "GREATER_THAN" } },
  sort: "random",
  direction: "DESC",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("CarouselBuilder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saving an edited carousel makes Home ask for its scenes again", async () => {
    const fetchMock = stubApi({
      // The edit's read and its save
      "/carousels/c1": () => jsonResponse(200, { carousel: CAROUSEL }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    const client = createQueryClient();
    // What Home holds: the list and the carousel's scenes
    client.setQueryData(queryKeys.carousels.list(), { carousels: [CAROUSEL] });
    client.setQueryData(queryKeys.carousels.execute("c1"), { scenes: [] });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/settings/carousels/c1/edit"]}>
          <Routes>
            <Route
              path="/settings/carousels/:id/edit"
              element={<CarouselBuilder />}
            />
            <Route path="/settings" element={<div>Settings</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByDisplayValue("Highly rated");
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    await waitFor(() =>
      expect(requestsTo(fetchMock, "/carousels/preview")).toHaveLength(1)
    );
    const update = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(update).toBeEnabled());
    expect(
      client.getQueryState(queryKeys.carousels.list())?.isInvalidated
    ).toBe(false);

    fireEvent.click(update);

    await screen.findByText("Settings");
    expect(
      client.getQueryState(queryKeys.carousels.execute("c1"))?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(queryKeys.carousels.list())?.isInvalidated
    ).toBe(true);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(put?.[1]?.body as string)).toMatchObject({
      title: "Highly rated",
    });
  });
});
