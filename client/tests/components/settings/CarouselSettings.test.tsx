/**
 * CarouselSettings (CS-21): the list merges the saved order with the user's
 * custom carousels, so a failed custom-carousel load offers Retry and no
 * list (a save then would drop the custom carousels' places); a failed
 * delete says so.
 */
import { MemoryRouter } from "react-router-dom";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../src/api";
import { createQueryClient } from "../../../src/api/queryClient";
import { queryKeys } from "../../../src/api/queryKeys";
import CarouselSettings from "../../../src/components/settings/CarouselSettings";
import { showError } from "../../../src/utils/toast";
import { flushPromises, must } from "../../testUtils";

const { mockGetCarousels, mockDeleteCarousel } = vi.hoisted(() => ({
  mockGetCarousels: vi.fn(),
  mockDeleteCarousel: vi.fn(),
}));

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    libraryApi: {
      ...actual.libraryApi,
      getCarousels: mockGetCarousels,
      deleteCarousel: mockDeleteCarousel,
    },
  };
});

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const PREFERENCES = [
  { id: "recentlyAddedScenes", enabled: true, order: 0 },
  { id: "custom-c1", enabled: false, order: 1 },
];
const CUSTOM = [{ id: "c1", title: "My Carousel", icon: "Film" }];

let client: QueryClient;

const renderSettings = (onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CarouselSettings carouselPreferences={PREFERENCES} onSave={onSave} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onSave;
};

/** Answers the "Delete carousel?" question with Delete */
const confirmDelete = async () => {
  const dialog = await screen.findByRole("dialog", {
    name: "Delete carousel?",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
};

describe("CarouselSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = createQueryClient();
  });

  it("a failed custom carousel load offers Retry and no list to save", async () => {
    mockGetCarousels
      .mockRejectedValueOnce(new api.ApiError("Database busy", 503))
      .mockResolvedValueOnce({ carousels: CUSTOM });
    renderSettings();

    expect(await screen.findByText("Database busy")).toBeInTheDocument();
    expect(screen.queryByText("Recently Added")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save Changes" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("My Carousel")).toBeInTheDocument();
    expect(screen.getByText("Recently Added")).toBeInTheDocument();
    expect(mockGetCarousels).toHaveBeenCalledTimes(2);
  });

  it("Delete asks first, naming the carousel: Cancel keeps it, Delete removes it", async () => {
    mockGetCarousels
      .mockResolvedValueOnce({ carousels: CUSTOM })
      .mockResolvedValue({ carousels: [] });
    mockDeleteCarousel.mockResolvedValue({ success: true });
    renderSettings();

    const row = must(
      (await screen.findByText("My Carousel")).closest<HTMLElement>(".border"),
      "the custom carousel's row"
    );
    fireEvent.click(
      within(row).getByRole("button", { name: "Delete carousel" })
    );

    // Nothing is deleted by the click itself
    const dialog = await screen.findByRole("dialog", {
      name: "Delete carousel?",
    });
    expect(within(dialog).getByText(/My Carousel/)).toBeInTheDocument();
    expect(mockDeleteCarousel).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await flushPromises();
    expect(mockDeleteCarousel).not.toHaveBeenCalled();
    expect(screen.getByText("My Carousel")).toBeInTheDocument();

    fireEvent.click(
      within(row).getByRole("button", { name: "Delete carousel" })
    );
    await confirmDelete();

    await waitFor(() => expect(mockDeleteCarousel).toHaveBeenCalledWith("c1"));
    await waitFor(() =>
      expect(screen.queryByText("My Carousel")).not.toBeInTheDocument()
    );
  });

  it("a failed delete shows the server's message and keeps the carousel", async () => {
    mockGetCarousels.mockResolvedValue({ carousels: CUSTOM });
    mockDeleteCarousel.mockRejectedValue(
      new api.ApiError("Carousel not found", 404)
    );
    const onSave = renderSettings();

    const row = must(
      (await screen.findByText("My Carousel")).closest<HTMLElement>(".border"),
      "the custom carousel's row"
    );
    fireEvent.click(
      within(row).getByRole("button", { name: "Delete carousel" })
    );
    await confirmDelete();

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Carousel not found")
    );
    await flushPromises();
    expect(screen.getByText("My Carousel")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a delete whose order save fails leaves the order marked unsaved", async () => {
    // The list as the server holds it: without the carousel once deleted
    mockGetCarousels
      .mockResolvedValueOnce({ carousels: CUSTOM })
      .mockResolvedValue({ carousels: [] });
    mockDeleteCarousel.mockResolvedValue({ success: true });
    const onSave = renderSettings(
      vi.fn().mockRejectedValue(new Error("reported by the tab"))
    );

    const row = must(
      (await screen.findByText("My Carousel")).closest<HTMLElement>(".border"),
      "the custom carousel's row"
    );
    fireEvent.click(
      within(row).getByRole("button", { name: "Delete carousel" })
    );
    await confirmDelete();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(screen.queryByText("My Carousel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    // The tab reported the failed save; the delete itself worked
    expect(showError).not.toHaveBeenCalled();
  });

  it("deleting a custom carousel removes it from Home's list and its cached scenes", async () => {
    mockGetCarousels
      .mockResolvedValueOnce({ carousels: CUSTOM })
      .mockResolvedValue({ carousels: [] });
    mockDeleteCarousel.mockResolvedValue({ success: true });
    // What Home holds for it
    client.setQueryData(queryKeys.carousels.execute("c1"), { scenes: [] });
    renderSettings();

    const row = must(
      (await screen.findByText("My Carousel")).closest<HTMLElement>(".border"),
      "the custom carousel's row"
    );
    fireEvent.click(
      within(row).getByRole("button", { name: "Delete carousel" })
    );
    await confirmDelete();

    await waitFor(() =>
      expect(screen.queryByText("My Carousel")).not.toBeInTheDocument()
    );
    expect(mockDeleteCarousel).toHaveBeenCalledWith("c1");
    // Home reads the same list: it no longer holds the carousel
    expect(client.getQueryData(queryKeys.carousels.list())).toEqual({
      carousels: [],
    });
    expect(
      client.getQueryData(queryKeys.carousels.execute("c1"))
    ).toBeUndefined();
  });
});
