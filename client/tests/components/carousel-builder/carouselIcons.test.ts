import { describe, expect, it } from "vitest";
import {
  CAROUSEL_ICONS,
  CAROUSEL_ICON_COMPONENTS,
  getCarouselIcon,
} from "@/components/carousel-builder/carouselIcons";

describe("carouselIcons", () => {
  it.each([...CAROUSEL_ICONS])("%s has a component", (name) => {
    expect(CAROUSEL_ICON_COMPONENTS[name]).toBeDefined();
    expect(getCarouselIcon(name)).toBe(CAROUSEL_ICON_COMPONENTS[name]);
  });

  it("has a component for every name and no others", () => {
    expect(Object.keys(CAROUSEL_ICON_COMPONENTS).sort()).toEqual(
      [...CAROUSEL_ICONS].sort()
    );
  });

  it("an unknown or missing name gives Film", () => {
    expect(getCarouselIcon("NoSuchIcon")).toBe(CAROUSEL_ICON_COMPONENTS.Film);
    expect(getCarouselIcon(undefined)).toBe(CAROUSEL_ICON_COMPONENTS.Film);
    expect(getCarouselIcon("")).toBe(CAROUSEL_ICON_COMPONENTS.Film);
    expect(getCarouselIcon("constructor")).toBe(CAROUSEL_ICON_COMPONENTS.Film);
  });
});
