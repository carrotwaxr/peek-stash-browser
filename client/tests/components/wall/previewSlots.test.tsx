import { type ReactNode, useRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PreviewSlotProvider,
  usePreviewSlot,
} from "@/components/wall/previewSlots";

const Tile = ({ id, wants }: { id: string; wants: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const playing = usePreviewSlot(id, wants, ref);
  return (
    <div ref={ref} data-testid={id} data-playing={String(playing)}>
      {id}
    </div>
  );
};

const wall = (max: number, tiles: Record<string, boolean>): ReactNode => (
  <PreviewSlotProvider max={max}>
    {Object.entries(tiles).map(([id, wants]) => (
      <Tile key={id} id={id} wants={wants} />
    ))}
  </PreviewSlotProvider>
);

const playing = (): string[] =>
  screen
    .getAllByTestId(/^t/)
    .filter((el) => el.dataset.playing === "true")
    .map((el) => el.dataset.testid ?? "");

const wanting = (ids: string[], on: string[] = ids): Record<string, boolean> =>
  Object.fromEntries(ids.map((id) => [id, on.includes(id)]));

describe("usePreviewSlot", () => {
  it("with 20 tiles in view only 6 play", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    render(wall(6, wanting(ids)));

    expect(playing()).toHaveLength(6);
  });

  it("a tile leaving view frees its slot for the next waiting tile in DOM order", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    const { rerender } = render(wall(1, wanting(ids, ["t1"])));
    expect(playing()).toEqual(["t1"]);

    // t4 starts waiting before t3, but t3 comes first in the document
    rerender(wall(1, wanting(ids, ["t1", "t4"])));
    rerender(wall(1, wanting(ids, ["t1", "t4", "t3"])));
    expect(playing()).toEqual(["t1"]);

    rerender(wall(1, wanting(ids, ["t4", "t3"])));
    expect(playing()).toEqual(["t3"]);
  });

  it("an unmounted tile frees its slot", () => {
    const { rerender } = render(wall(1, { t1: true, t2: true }));
    expect(playing()).toEqual(["t1"]);

    rerender(wall(1, { t2: true }));
    expect(playing()).toEqual(["t2"]);
  });

  it("a tile that holds a slot keeps it while others arrive", () => {
    const { rerender } = render(wall(1, { t2: true, t1: false }));
    expect(playing()).toEqual(["t2"]);

    rerender(wall(1, { t2: true, t1: true }));
    expect(playing()).toEqual(["t2"]);
  });

  it("without a provider a tile that wants to play plays", () => {
    render(<Tile id="t1" wants />);
    expect(playing()).toEqual(["t1"]);
  });
});
