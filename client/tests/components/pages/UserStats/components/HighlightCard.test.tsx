import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HighlightCard from "@/components/pages/UserStats/components/HighlightCard";

const config = vi.hoisted(() => ({ hasMultipleInstances: true }));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => config,
}));

describe("HighlightCard", () => {
  beforeEach(() => {
    config.hasMultipleInstances = true;
  });

  it("links the highlight to its own instance", () => {
    renderWithProviders(
      <HighlightCard
        title="Most O'd Performer"
        entityType="performer"
        item={{
          id: "12",
          instanceId: "inst-b",
          name: "B-12",
          imageUrl: null,
          oCount: 3,
        }}
        statLabel="Os"
        statValue={3}
      />
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/performer/12?instance=inst-b");
    expect(link.textContent).toContain("B-12");
    expect(link.textContent).toContain("3 Os");
  });

  it("links by id alone with one instance", () => {
    config.hasMultipleInstances = false;

    renderWithProviders(
      <HighlightCard
        title="Most Watched Scene"
        item={{
          id: "5",
          instanceId: "inst-a",
          title: "Five",
          filePath: null,
          imageUrl: null,
        }}
        statLabel="plays"
        statValue={2}
      />
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe("/scene/5");
  });

  it("with an opener, the card is a button that opens the item, not the home page", () => {
    const onOpen = vi.fn();

    renderWithProviders(
      <HighlightCard
        title="Most Viewed Image"
        entityType="image"
        item={{
          id: "12",
          instanceId: "inst-b",
          title: "Twelve",
          filePath: null,
          imageUrl: null,
          viewCount: 4,
        }}
        statLabel="views"
        statValue={4}
        onOpen={onOpen}
      />
    );

    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Twelve");
    expect(button.textContent).toContain("4 views");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
