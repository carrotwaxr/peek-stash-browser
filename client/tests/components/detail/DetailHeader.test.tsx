import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DetailHeader from "@/components/detail/DetailHeader";
import { renderDetailPart } from "./renderDetailPart";

const header = (
  overrides: Partial<Parameters<typeof DetailHeader>[0]> = {}
) => (
  <DetailHeader
    type="tag"
    title="Thing"
    rating={60}
    favorite={false}
    onRatingChange={vi.fn()}
    onFavoriteChange={vi.fn()}
    {...overrides}
  />
);

describe("DetailHeader", () => {
  it("shows the title, its extras and the subtitle", () => {
    renderDetailPart(
      header({
        titleExtras: <span>extra</span>,
        subtitle: "Also known as: Ali",
        actions: <button type="button">Play Slideshow</button>,
      })
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Thingextra/
    );
    expect(screen.getByText("Also known as: Ali")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Play Slideshow" })
    ).toBeVisible();
  });

  it("favorite and rating follow the display settings", () => {
    const onFavoriteChange = vi.fn();
    const shown = renderDetailPart(header({ onFavoriteChange }), {
      settings: { showFavorite: true, showRating: true },
    });

    expect(screen.getByRole("slider")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));
    expect(onFavoriteChange).toHaveBeenCalledWith(true);
    shown.unmount();

    renderDetailPart(header(), {
      settings: { showFavorite: false, showRating: false },
    });
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /favorites/ })).toBeNull();
  });

  it("View in Stash only with a stashUrl", () => {
    const withUrl = renderDetailPart(
      header({ stashUrl: "http://stash.local/tags/5" })
    );
    expect(screen.getByRole("link", { name: "View in Stash" })).toHaveAttribute(
      "href",
      "http://stash.local/tags/5"
    );
    withUrl.unmount();

    renderDetailPart(header({ stashUrl: null }));
    expect(screen.queryByRole("link", { name: "View in Stash" })).toBeNull();
  });
});
