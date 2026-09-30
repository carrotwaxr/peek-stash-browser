import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WallItem from "../../../src/components/wall/WallItem";

vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

const config = {
  getImageUrl: () => "/shot.jpg",
  getPreviewUrl: () => null,
  getTitle: () => "A clip",
  getSubtitle: () => null,
  hasPreview: false,
};

const renderItem = () =>
  render(
    <MemoryRouter>
      <WallItem
        item={{ id: "c1", instanceId: "i1", sceneId: "s1", seconds: 3 }}
        config={config}
        entityType="clip"
        width={200}
        height={120}
        playbackMode="static"
      />
    </MemoryRouter>
  );

describe("WallItem", () => {
  it("an image that fails to load removes the spinner", () => {
    const { container } = renderItem();
    expect(container.querySelector(".animate-spin")).not.toBeNull();

    fireEvent.error(screen.getByRole("img"));

    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("an image that loads removes the spinner", () => {
    const { container } = renderItem();
    fireEvent.load(screen.getByRole("img"));
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
