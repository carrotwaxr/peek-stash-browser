import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import DetailTabs from "@/components/detail/DetailTabs";
import type { DetailTabSpec } from "@/components/detail/detailTabState";
import { countsResult, renderDetailPart } from "./renderDetailPart";

/** Three tabs whose content names them; counts undefined while loading */
const tabs = (counts?: {
  scenes: number;
  galleries: number;
  images: number;
}): DetailTabSpec[] => [
  {
    id: "scenes",
    label: "Scenes",
    count: counts?.scenes,
    render: () => <p>scenes list</p>,
  },
  {
    id: "galleries",
    label: "Galleries",
    count: counts?.galleries,
    render: () => <p>galleries list</p>,
  },
  {
    id: "images",
    label: "Images",
    count: counts?.images,
    render: () => <p>images list</p>,
  },
];

const tabButton = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("DetailTabs", () => {
  it("shows every tab without a badge and none open until the counts answer", () => {
    renderDetailPart(
      <DetailTabs
        tabs={tabs()}
        counts={countsResult()}
        fallbackTab="scenes"
        emptyText="This tag has no content in Peek"
      />
    );

    for (const name of ["Scenes", "Galleries", "Images"]) {
      expect(tabButton(name)).toHaveTextContent(new RegExp(`^${name}$`));
    }
    expect(screen.queryByText(/list$/)).toBeNull();
    expect(screen.queryByText(/no content/)).toBeNull();
  });

  it("opens the first tab with content", () => {
    const answer = { scenes: 0, galleries: 3, images: 2 };
    renderDetailPart(
      <DetailTabs
        tabs={tabs(answer)}
        counts={countsResult({ data: { counts: answer } })}
        fallbackTab="scenes"
        emptyText="This tag has no content in Peek"
      />
    );

    expect(screen.getByText("galleries list")).toBeVisible();
    expect(tabButton("Galleries")).toHaveAttribute("aria-current", "page");
    expect(within(tabButton("Galleries")).getByText("3")).toBeVisible();
    // A tab with nothing in it is not offered
    expect(screen.queryByRole("button", { name: /^Scenes/ })).toBeNull();
  });

  it("the URL's tab wins", () => {
    const answer = { scenes: 4, galleries: 3, images: 2 };
    const { search } = renderDetailPart(
      <DetailTabs
        tabs={tabs(answer)}
        counts={countsResult({ data: { counts: answer } })}
        fallbackTab="scenes"
        emptyText="This tag has no content in Peek"
      />,
      { url: "/tag/5?tab=images&page=3" }
    );

    expect(screen.getByText("images list")).toBeVisible();
    expect(screen.queryByText("scenes list")).toBeNull();

    // Back to the default tab: the URL drops the tab and the list's page
    fireEvent.click(tabButton("Scenes"));
    expect(screen.getByText("scenes list")).toBeVisible();
    expect(search()).toEqual({});
  });

  it("says the empty text once every count is 0", () => {
    const answer = { scenes: 0, galleries: 0, images: 0 };
    renderDetailPart(
      <DetailTabs
        tabs={tabs(answer)}
        counts={countsResult({ data: { counts: answer } })}
        fallbackTab="scenes"
        emptyText="This tag has no content in Peek"
      />
    );

    expect(screen.getByText("This tag has no content in Peek")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/list$/)).toBeNull();
  });

  it("a counts error shows under the tabs with Retry", () => {
    const counts = countsResult({
      error: new ApiError("Server error", 500, {}),
    });
    renderDetailPart(
      <DetailTabs
        tabs={tabs()}
        counts={counts}
        fallbackTab="scenes"
        emptyText="This tag has no content in Peek"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the counts: Server error"
    );
    // The tabs stay, without badges
    expect(tabButton("Scenes")).toHaveTextContent(/^Scenes$/);

    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(counts.refetch).toHaveBeenCalledTimes(1);
  });
});
