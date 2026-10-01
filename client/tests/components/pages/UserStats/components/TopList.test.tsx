import { screen } from "@testing-library/react";
import { renderWithProviders } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopList from "@/components/pages/UserStats/components/TopList";

const config = vi.hoisted(() => ({ hasMultipleInstances: true }));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => config,
}));

/** One entry of a top list, as the stats endpoint sends it */
const entry = (id: string, instanceId: string, name: string) => ({
  id,
  instanceId,
  name,
  imageUrl: null,
  playDuration: 0,
  playCount: 1,
  oCount: 0,
  score: 50,
});

/** Each row's link, by the name it shows */
const links = () =>
  screen
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);

describe("TopList", () => {
  beforeEach(() => {
    config.hasMultipleInstances = true;
  });

  it("links each entry to its own instance when two servers share an id", () => {
    renderWithProviders(
      <TopList
        title="Top Performers"
        entityType="performer"
        items={[entry("12", "inst-b", "B-12"), entry("12", "inst-a", "A-12")]}
      />
    );

    expect(links()).toEqual([
      [expect.stringContaining("B-12"), "/performer/12?instance=inst-b"],
      [expect.stringContaining("A-12"), "/performer/12?instance=inst-a"],
    ]);
  });

  it("links by id alone with one instance", () => {
    config.hasMultipleInstances = false;

    renderWithProviders(
      <TopList
        title="Top Scenes"
        entityType="scene"
        items={[{ ...entry("5", "inst-a", ""), title: "Five" }]}
      />
    );

    expect(links()).toEqual([[expect.stringContaining("Five"), "/scene/5"]]);
  });
});
