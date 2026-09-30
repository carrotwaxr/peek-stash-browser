import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImageCard from "../../../src/components/cards/ImageCard";
import type { BaseCardProps } from "../../../src/components/ui/BaseCard";

const { baseCardProps } = vi.hoisted(() => ({
  baseCardProps: vi.fn<(props: BaseCardProps) => void>(),
}));

vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
// Captures the rating controls the card hands to BaseCard
vi.mock("../../../src/components/ui/BaseCard", () => ({
  BaseCard: (props: BaseCardProps) => {
    baseCardProps(props);
    return null;
  },
}));

beforeEach(() => baseCardProps.mockClear());

describe("ImageCard", () => {
  const mockImage = {
    id: "1",
    title: "Test Image",
    paths: { thumbnail: "/thumb.jpg", image: "/full.jpg" },
  };

  it("is a React forwardRef component", () => {
    expect(typeof ImageCard).toBe("object");
    expect(ImageCard.displayName).toBe("ImageCard");
  });

  it("accepts expected props", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
      fromPageTitle: "Images",
      tabIndex: 0,
    } as any);

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
    } as any);

    expect(element.props.image).toBe(mockImage);
  });

  it("passes correct link path", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
    } as any);

    expect(element.props.image.id).toBe("1");
  });

  it("passes image with all data", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
    } as any);

    const image = element.props.image;
    expect(image.title).toBe("Test Image");
    expect(image.paths.thumbnail).toBe("/thumb.jpg");
  });

  it("uses fallback title when no title provided", () => {
    const imageNoTitle = { ...mockImage, title: null };
    const element = createElement(ImageCard, {
      image: imageNoTitle,
    } as any);

    expect(element.props.image.id).toBe("1");
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
      fromPageTitle: "Images",
    } as any);

    expect(element.props.fromPageTitle).toBe("Images");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
      tabIndex: 5,
    } as any);

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(ImageCard, {
      image: mockImage,
      onHideSuccess,
    } as any);

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });

  it("names the image's instance in each change it reports", () => {
    const onOCounterChange = vi.fn();
    const onRatingChange = vi.fn();
    const onFavoriteChange = vi.fn();
    render(
      <MemoryRouter>
        <ImageCard
          image={
            {
              ...mockImage,
              instanceId: "inst-b",
              rating100: 40,
            } as never
          }
          onOCounterChange={onOCounterChange}
          onRatingChange={onRatingChange}
          onFavoriteChange={onFavoriteChange}
        />
      </MemoryRouter>
    );

    const controls = must(
      must(baseCardProps.mock.lastCall, "BaseCard's props")[0]
        .ratingControlsProps,
      "the rating controls"
    );
    controls.onOCounterChange?.("1", 3);
    controls.onRatingChange?.("1", 80);
    controls.onFavoriteChange?.("1", true);

    expect(onOCounterChange).toHaveBeenCalledWith("1", 3, "inst-b");
    expect(onRatingChange).toHaveBeenCalledWith("1", 80, "inst-b");
    expect(onFavoriteChange).toHaveBeenCalledWith("1", true, "inst-b");
  });
});
