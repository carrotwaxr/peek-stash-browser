import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DetailStats, { type DetailStat } from "@/components/detail/DetailStats";
import { DetailTabContext } from "@/components/detail/detailTabState";
import TabNavigation from "@/components/ui/TabNavigation";
import { renderDetailPart } from "./renderDetailPart";

const STATS: DetailStat[] = [
  { label: "Scenes:", value: 3, tab: "scenes" },
  { label: "Galleries:", value: 4, tab: "galleries" },
  { label: "O-Count:", value: 2 },
  { label: "Images:", value: 0, tab: "images" },
  { label: "Groups:", value: undefined, tab: "groups" },
];

const inLayout = (ui: ReactElement) => (
  <DetailTabContext.Provider
    value={{ activeTab: "scenes", defaultTab: "scenes" }}
  >
    {ui}
  </DetailTabContext.Provider>
);

/** A statistic's row, by its label */
const row = (label: string) =>
  screen.getByText(label).parentElement as HTMLElement;

describe("DetailStats", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows each statistic with a value, under Statistics", () => {
    renderDetailPart(inLayout(<DetailStats stats={STATS} />));

    expect(screen.getByRole("heading", { name: "Statistics" })).toBeVisible();
    expect(row("Scenes:")).toHaveTextContent(/^Scenes:3$/);
    expect(row("O-Count:")).toHaveTextContent(/^O-Count:2$/);
    expect(row("Images:")).toHaveTextContent(/^Images:0$/);
    // No value, no row
    expect(screen.queryByText("Groups:")).toBeNull();
    // Nothing to open: a count of 0, a statistic without a tab
    expect(within(row("Images:")).queryByRole("button")).toBeNull();
    expect(within(row("O-Count:")).queryByRole("button")).toBeNull();
  });

  it("a count with a tab switches to it and clears the list's page", () => {
    const { search } = renderDetailPart(
      inLayout(<DetailStats stats={STATS} />),
      { url: "/tag/5?page=4&instance=inst-a" }
    );

    // The open tab's count is not a link to itself
    expect(
      within(row("Scenes:")).getByRole("button", { name: "3" })
    ).toBeDisabled();

    fireEvent.click(
      within(row("Galleries:")).getByRole("button", { name: "4" })
    );

    expect(search()).toEqual({ tab: "galleries", instance: "inst-a" });
  });

  it("a count scrolls down to the tab bar once its tab has rendered", () => {
    // Scrolling in the click aims at the old tab's page; the new tab's
    // shorter content then stops a smooth scroll where it started
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    // What the page shows when it scrolls: the element's tabs, the open content
    const scrolls: Array<{ tabs: string[]; content: string | null }> = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element
    ) {
      scrolls.push({
        tabs: within(this as HTMLElement)
          .queryAllByRole("button")
          .map((tab) => tab.textContent ?? ""),
        content: screen.getByTestId("tab-content").textContent,
      });
    });
    const Tabs = () => {
      const [params] = useSearchParams();
      return (
        <>
          <TabNavigation
            tabs={[
              { id: "scenes", label: "Scenes", count: 3 },
              { id: "galleries", label: "Galleries", count: 4 },
            ]}
            defaultTab="scenes"
          />
          <p data-testid="tab-content">{params.get("tab") ?? "scenes"}</p>
        </>
      );
    };
    renderDetailPart(
      inLayout(
        <>
          <DetailStats stats={STATS} />
          <Tabs />
        </>
      )
    );

    fireEvent.click(
      within(row("Galleries:")).getByRole("button", { name: "4" })
    );

    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrolls).toEqual([
      { tabs: ["Scenes3", "Galleries4"], content: "galleries" },
    ]);
  });

  it("a statistic with a path opens it", () => {
    const { path, search } = renderDetailPart(
      inLayout(
        <DetailStats
          stats={[
            { label: "Markers:", value: 2, to: "/clips?tagId=5" },
            { label: "Clips:", value: 0, to: "/clips?tagId=6" },
          ]}
        />
      )
    );

    expect(within(row("Clips:")).queryByRole("button")).toBeNull();
    fireEvent.click(within(row("Markers:")).getByRole("button", { name: "2" }));

    expect(path()).toBe("/clips");
    expect(search()).toEqual({ tagId: "5" });
  });

  it("the rating bar shows the current rating", () => {
    const { rerender } = renderDetailPart(
      inLayout(<DetailStats stats={STATS} rating={60} />)
    );
    expect(screen.getByText("60/100")).toBeVisible();

    // The page passes the hook's rating, which a write moves at once
    rerender(inLayout(<DetailStats stats={STATS} rating={80} />));
    expect(screen.getByText("80/100")).toBeVisible();
    expect(screen.queryByText("60/100")).toBeNull();

    rerender(inLayout(<DetailStats stats={STATS} rating={null} />));
    expect(screen.queryByText(/\/100$/)).toBeNull();
  });

  it("shows the page's own content below the statistics", () => {
    renderDetailPart(
      inLayout(
        <DetailStats stats={STATS}>
          <p>O-Count Rate</p>
        </DetailStats>
      )
    );

    expect(screen.getByText("O-Count Rate")).toBeVisible();
  });
});
