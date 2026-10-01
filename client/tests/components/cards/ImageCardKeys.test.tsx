import { MemoryRouter } from "react-router-dom";
import type { ImageListItem } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import ImageCard from "../../../src/components/cards/ImageCard";

vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
vi.mock("../../../src/hooks/useHiddenEntities", () => ({
  useHiddenEntities: () => ({
    hideEntity: vi.fn(),
    hideConfirmationDisabled: true,
  }),
}));
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

const image = {
  id: "1",
  instanceId: "inst-1",
  title: "Test Image",
  paths: { thumbnail: "/thumb.jpg", image: "/full.jpg" },
  performers: [],
  tags: [],
  galleries: [],
};

const renderCard = (onClick: (image: unknown) => void) => {
  const utils = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ImageCard
          image={image as unknown as ImageListItem}
          onClick={onClick}
          tabIndex={0}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return must(utils.container.firstElementChild as HTMLElement | null, "card");
};

describe("ImageCard keys, with the real BaseCard", () => {
  it("Enter on a focused image card opens the lightbox (onClick), where today it does nothing", () => {
    const onClick = vi.fn();
    const card = renderCard(onClick);

    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(image);
  });

  it("a click on the card still opens the lightbox once", () => {
    const onClick = vi.fn();
    const card = renderCard(onClick);

    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(image);
  });
});
