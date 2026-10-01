import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ColumnConfigPopover from "@/components/table/ColumnConfigPopover";
import TableView from "@/components/table/TableView";

const COLUMNS = [
  {
    id: "title",
    label: "Title",
    sortable: true,
    width: "w-48",
    mandatory: true,
  },
  {
    id: "rating",
    label: "Rating",
    sortable: true,
    width: "w-24",
    mandatory: false,
  },
];

const renderTable = () =>
  render(
    <MemoryRouter>
      <TableView
        items={[{ id: "1", title: "One", rating100: 80 }]}
        columns={COLUMNS}
        entityType="performer"
      />
    </MemoryRouter>
  );

describe("TableView", () => {
  it("at md and up the table body scrolls inside a box of viewport height and the header is sticky in it; below md the page scrolls", () => {
    const { container } = renderTable();

    const box = container.querySelector("table")?.parentElement;
    expect(box).toBeTruthy();
    const boxClasses = box?.className.split(/\s+/) ?? [];
    // Tablet and desktop: a box no taller than the viewport that scrolls
    expect(boxClasses).toContain("md:overflow-auto");
    expect(boxClasses.some((c) => /^md:max-h-\[calc\(100dvh-/.test(c))).toBe(
      true
    );
    // Phones: no height limit, so the page scrolls (only sideways in the box)
    expect(boxClasses.some((c) => /^max-h-/.test(c))).toBe(false);

    const thead = container.querySelector("thead");
    const headClasses = thead?.className.split(/\s+/) ?? [];
    expect(headClasses).toContain("md:sticky");
    expect(headClasses).toContain("md:top-0");
    expect(headClasses.some((c) => /^md:z-/.test(c))).toBe(true);
    // Not sticky on a phone
    expect(headClasses).not.toContain("sticky");
  });

  it("has no column picker of its own", () => {
    const { container } = renderTable();

    expect(container.querySelector('button[aria-label="Columns"]')).toBeNull();
    // Every header cell is a column: no spare first cell
    expect(container.querySelectorAll("th")).toHaveLength(COLUMNS.length);
  });
});

describe("ColumnConfigPopover", () => {
  it("the picker is never wider than the viewport", () => {
    const { container } = render(
      <ColumnConfigPopover
        allColumns={COLUMNS}
        visibleColumnIds={["title", "rating"]}
        columnOrder={["title", "rating"]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));

    const popover = container.querySelector<HTMLElement>(".shadow-xl");
    expect(popover).not.toBeNull();
    const classes = popover?.className.split(/\s+/) ?? [];
    expect(classes).toContain("max-w-[calc(100vw-2rem)]");
    // Anchored to the trigger's right edge on a phone, its left from sm up
    expect(classes).toContain("right-0");
    expect(classes).toContain("sm:right-auto");
    expect(classes).toContain("sm:left-0");
  });
});
