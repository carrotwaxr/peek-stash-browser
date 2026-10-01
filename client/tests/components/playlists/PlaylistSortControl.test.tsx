import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlaylistSortControl from "@/components/playlists/PlaylistSortControl";

function renderControl(
  overrides: Partial<Parameters<typeof PlaylistSortControl>[0]> = {}
) {
  const props = {
    field: "position",
    direction: "ASC" as const,
    perPage: 50,
    onFieldChange: vi.fn<(field: string) => void>(),
    onDirectionChange: vi.fn<(direction: "ASC" | "DESC") => void>(),
    onPerPageChange: vi.fn<(perPage: number) => void>(),
    ...overrides,
  };
  render(<PlaylistSortControl {...props} />);
  return props;
}

const optionLabels = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("PlaylistSortControl", () => {
  it("lists Playlist order, Date added to playlist and the scene sorts; Scene Number is absent", () => {
    renderControl();

    const labels = optionLabels(screen.getByLabelText("Sort playlist by"));

    expect(labels.slice(0, 2)).toEqual([
      "Playlist order",
      "Date added to playlist",
    ]);
    for (const label of ["Title", "Duration", "Rating", "Random"]) {
      expect(labels).toContain(label);
    }
    expect(labels).not.toContain("Scene Number");
  });

  it("reports the chosen sort field", () => {
    const props = renderControl();

    fireEvent.change(screen.getByLabelText("Sort playlist by"), {
      target: { value: "title" },
    });

    expect(props.onFieldChange).toHaveBeenCalledWith("title");
  });

  it("the direction toggle flips ASC/DESC", () => {
    const asc = renderControl({ direction: "ASC" });
    fireEvent.click(screen.getByRole("button", { name: /ascending/i }));
    expect(asc.onDirectionChange).toHaveBeenCalledWith("DESC");
  });

  it("the direction toggle flips DESC to ASC", () => {
    const desc = renderControl({ direction: "DESC" });
    fireEvent.click(screen.getByRole("button", { name: /descending/i }));
    expect(desc.onDirectionChange).toHaveBeenCalledWith("ASC");
  });

  it("the page-size control offers 25, 50 and 100 only", () => {
    const props = renderControl();

    const perPage = screen.getByLabelText("Per page");
    expect(optionLabels(perPage)).toEqual(["25", "50", "100"]);

    fireEvent.change(perPage, { target: { value: "100" } });
    expect(props.onPerPageChange).toHaveBeenCalledWith(100);
  });
});
