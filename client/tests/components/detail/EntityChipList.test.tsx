import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EntityChipList from "@/components/detail/EntityChipList";
import { renderDetailPart } from "./renderDetailPart";

const config = vi.hoisted(() => ({ current: { hasMultipleInstances: true } }));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => config.current,
}));

const REFS = [
  { id: "7", name: "Parent", instanceId: "inst-a" },
  { id: "8", name: "Other", instanceId: "inst-b", description: "Part two" },
];

const hrefOf = (name: string) =>
  screen
    .getByRole("link", { name: new RegExp(`^${name}`) })
    .getAttribute("href");

describe("EntityChipList", () => {
  beforeEach(() => {
    config.current = { hasMultipleInstances: true };
  });

  it("links carry the instance on several servers", () => {
    renderDetailPart(<EntityChipList type="tag" refs={REFS} tagHue />);

    expect(hrefOf("Parent")).toBe("/tag/7?instance=inst-a");
    expect(hrefOf("Other")).toBe("/tag/8?instance=inst-b");
  });

  it("links are bare on one server", () => {
    config.current = { hasMultipleInstances: false };
    renderDetailPart(<EntityChipList type="group" refs={REFS} />);

    expect(hrefOf("Parent")).toBe("/collection/7");
    expect(hrefOf("Other")).toBe("/collection/8");
  });

  it("shows a ref's description under its name", () => {
    renderDetailPart(<EntityChipList type="group" refs={REFS} />);

    expect(screen.getByRole("link", { name: /^Other/ })).toHaveTextContent(
      "OtherPart two"
    );
  });

  it("renders nothing without refs", () => {
    const { container } = renderDetailPart(
      <EntityChipList type="tag" refs={[]} tagHue />
    );

    expect(container.querySelector("a")).toBeNull();
  });
});
