import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EntityDetailLayout from "@/components/detail/EntityDetailLayout";
import type { DetailTabSpec } from "@/components/detail/detailTabState";
import { countsResult, foundTag, renderDetailPart } from "./renderDetailPart";

const ANSWER = { scenes: 2, performers: 3 };

const TABS: DetailTabSpec[] = [
  {
    id: "scenes",
    label: "Scenes",
    count: ANSWER.scenes,
    render: () => <p>scenes list</p>,
    takesSubToggle: true,
  },
  {
    id: "performers",
    label: "Performers",
    count: ANSWER.performers,
    render: () => <p>performers list</p>,
  },
];

const layout = (detail = foundTag()) => (
  <EntityDetailLayout
    type="tag"
    detail={detail}
    title="Thing"
    hero={<div>hero image</div>}
    description="A long story"
    sections={<section>the sections</section>}
    subToggle={{ param: "includeSubTags", label: "Include sub-tags", count: 4 }}
    tabs={TABS}
    counts={countsResult({ data: { counts: ANSWER } })}
    fallbackTab="scenes"
    emptyText="This tag has no content in Peek"
  />
);

describe("EntityDetailLayout", () => {
  it("shows the back button, the header, the hero, the sections and the tabs", () => {
    renderDetailPart(layout());

    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Thing"
    );
    expect(screen.getByText("hero image")).toBeVisible();
    expect(screen.getByText("the sections")).toBeVisible();
    expect(screen.getByText("scenes list")).toBeVisible();
    expect(document.title).toBe("Thing - Peek");
  });

  it("the description renders once", () => {
    const shown = renderDetailPart(layout(), {
      settings: { showDescriptionOnDetail: true },
    });
    expect(screen.getAllByText("A long story")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Details" })).toBeVisible();
    shown.unmount();

    // The viewer turned descriptions off
    renderDetailPart(layout(), {
      settings: { showDescriptionOnDetail: false },
    });
    expect(screen.queryByText("A long story")).toBeNull();
  });

  it("the toggle shows only on tabs that take it", () => {
    const onScenes = renderDetailPart(layout(), { url: "/tag/5" });
    expect(
      screen.getByRole("checkbox", { name: "Include sub-tags (4)" })
    ).toBeVisible();
    onScenes.unmount();

    renderDetailPart(layout(), { url: "/tag/5?tab=performers" });
    expect(screen.getByText("performers list")).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("the header writes through the detail's rating and favorite", () => {
    const detail = foundTag({ rating: 40, favorite: true });
    renderDetailPart(layout(detail), {
      settings: { showFavorite: true, showRating: true },
    });

    expect(screen.getByRole("slider")).toHaveValue("4");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from favorites" })
    );
    expect(detail.setFavorite).toHaveBeenCalledWith(false);
  });
});
