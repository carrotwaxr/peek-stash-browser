import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FavoriteButton from "../../../src/components/ui/FavoriteButton";
import {
  MOUSE_QUERIES,
  TOUCH_QUERIES,
  matchMediaQueries,
} from "../../helpers/matchMedia";

describe("FavoriteButton hit area", () => {
  let restoreMedia: (() => void) | null = null;
  afterEach(() => {
    restoreMedia?.();
    restoreMedia = null;
  });

  it("on a coarse pointer the favorite button has a 44 px hit area", () => {
    restoreMedia = matchMediaQueries(TOUCH_QUERIES);
    render(<FavoriteButton isFavorite={false} onChange={() => {}} />);

    const { className } = screen.getByRole("button");

    // A small button is 28 px: 8 px out on each side
    expect(className).toContain("relative");
    expect(className).toContain("before:absolute");
    expect(className).toContain("before:-inset-2");
  });

  it("with a mouse the favorite button has no extra hit area", () => {
    restoreMedia = matchMediaQueries(MOUSE_QUERIES);
    render(<FavoriteButton isFavorite={false} onChange={() => {}} />);

    expect(screen.getByRole("button").className).not.toContain("before:");
  });
});
