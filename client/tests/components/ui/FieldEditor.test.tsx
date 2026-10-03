/**
 * FieldEditor: the one editor of a filter row's value. It draws the row's
 * option as the panel does and hands back the row's whole state (its key and
 * companions: condition, sub-items, excluded picks), no other key. The panel,
 * the carousel builder and, later, the chip popover and the row editor draw
 * it.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import FieldEditor from "@/components/ui/FieldEditor";
import { buildSceneFilter } from "@/utils/filterConfig";
import { type FilterOption, filterOptionsOf } from "@/utils/filterFields";
import type { PanelState } from "@/utils/filterFields";

vi.mock("@/api", () => ({
  libraryApi: {
    findTagsMinimal: vi.fn(
      (params: { ids?: string[] }): Promise<unknown[]> =>
        Promise.resolve(
          params.ids
            ? [
                { id: "1", instanceId: "a", name: "Alpha" },
                { id: "2", instanceId: "a", name: "Beta" },
              ]
            : []
        )
    ),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
  },
}));

const optionOf = (
  kind: "scene" | "performer",
  key: string,
  unitPreference = "metric"
): FilterOption =>
  must(filterOptionsOf(kind, unitPreference).find((each) => each.key === key));

interface HarnessProps {
  option: FilterOption;
  initial?: PanelState;
  spy?: (next: PanelState) => void;
  controlId?: string;
  autoFocus?: boolean;
  hideLabel?: boolean;
  openPicker?: boolean;
}

/** The state around one editor, as the panel or a builder holds it */
function Harness({
  option,
  initial = {},
  spy,
  controlId,
  autoFocus,
  hideLabel,
  openPicker,
}: HarnessProps) {
  const [state, setState] = useState<PanelState>(initial);
  return (
    <>
      <FieldEditor
        option={option}
        state={state}
        onChange={(next) => {
          setState(next);
          spy?.(next);
        }}
        {...(controlId === undefined ? {} : { controlId })}
        {...(autoFocus === undefined ? {} : { autoFocus })}
        {...(hideLabel === undefined ? {} : { hideLabel })}
        {...(openPicker === undefined ? {} : { openPicker })}
      />
      <output data-testid="state">{JSON.stringify(state)}</output>
    </>
  );
}

const lastOf = (spy: ReturnType<typeof vi.fn>): unknown =>
  must(spy.mock.calls[spy.mock.calls.length - 1])[0];

describe("a ref row", () => {
  it("a ref row edits its ids, condition, sub-items and excluded picks as panel state", async () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness
        option={optionOf("scene", "tagIds")}
        // A key of another row is not the editor's to return
        initial={{ tagIds: ["1:a", "2:a"], title: "kept elsewhere" }}
        spy={spy}
      />
    );
    expect(await screen.findByText("Alpha")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Tags condition" }), {
      target: { value: "INCLUDES" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Include sub-tags" }));
    fireEvent.click(screen.getByRole("button", { name: "Exclude Beta" }));

    expect(lastOf(spy)).toEqual({
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      tagIdsDepth: -1,
      tagIdsExclude: ["2:a"],
    });
  });

  it("unticking sub-tags and un-excluding drop their keys", async () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness
        option={optionOf("scene", "tagIds")}
        initial={{ tagIds: ["1:a"], tagIdsDepth: -1, tagIdsExclude: ["2:a"] }}
        spy={spy}
      />
    );
    expect(await screen.findByText("Alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Include sub-tags" }));
    expect(lastOf(spy)).toEqual({ tagIds: ["1:a"], tagIdsExclude: ["2:a"] });

    fireEvent.click(screen.getByRole("button", { name: "Exclude Beta" }));
    expect(lastOf(spy)).toEqual({ tagIds: ["1:a", "2:a"] });
  });
});

describe("a range row", () => {
  it("a range row keeps decimals where its step allows", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(<Harness option={optionOf("scene", "bitrate")} spy={spy} />);

    fireEvent.change(screen.getByPlaceholderText("Min"), {
      target: { value: "2.5" },
    });

    expect(lastOf(spy)).toEqual({ bitrate: { min: 2.5 } });
  });

  it("a whole-unit row truncates", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness option={{ ...optionOf("scene", "oCount"), step: 1 }} spy={spy} />
    );

    fireEvent.change(screen.getByPlaceholderText("Max"), {
      target: { value: "88.7" },
    });

    expect(lastOf(spy)).toEqual({ oCount: { max: 88 } });
  });

  it("a rating is typed on the 0 to 10 scale ratings show and held as rating100", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness
        option={optionOf("scene", "rating")}
        initial={{ rating: { max: 95 } }}
        spy={spy}
      />
    );

    expect(screen.getByRole("textbox", { name: "Maximum Rating" })).toHaveValue(
      "9.5"
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Minimum Rating" }), {
      target: { value: "6" },
    });
    expect(lastOf(spy)).toEqual({ rating: { min: 60, max: 95 } });

    // A scene rated 6.8 (rating100 68) is at least 6
    expect(buildSceneFilter({ rating: { min: 60 } })).toEqual({
      rating100: { modifier: "BETWEEN", value: 60 },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Minimum Rating" }), {
      target: { value: "6.8" },
    });
    expect(lastOf(spy)).toEqual({ rating: { min: 68, max: 95 } });

    // One decimal, as the rating slider: a second one is not taken
    fireEvent.change(screen.getByRole("textbox", { name: "Minimum Rating" }), {
      target: { value: "6.85" },
    });
    expect(screen.getByRole("textbox", { name: "Minimum Rating" })).toHaveValue(
      "6.8"
    );
  });

  it("a rating takes a comma as its decimal point and nothing past 10", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(<Harness option={optionOf("scene", "rating")} spy={spy} />);
    const minimum = screen.getByRole("textbox", { name: "Minimum Rating" });
    const maximum = screen.getByRole("textbox", { name: "Maximum Rating" });

    // A comma locale's decimal keyboard offers ","
    fireEvent.change(minimum, { target: { value: "6,5" } });
    expect(lastOf(spy)).toEqual({ rating: { min: 65 } });
    fireEvent.blur(minimum);
    expect(minimum).toHaveValue("6.5");

    fireEvent.change(maximum, { target: { value: "10" } });
    expect(lastOf(spy)).toEqual({ rating: { min: 65, max: 100 } });
    // Past the scale's 10 is not taken (10.5 would be sent as 105)
    fireEvent.change(maximum, { target: { value: "10.5" } });
    fireEvent.change(maximum, { target: { value: "105" } });
    expect(maximum).toHaveValue("10");
    expect(lastOf(spy)).toEqual({ rating: { min: 65, max: 100 } });
  });

  it("a bound of 0 shows, and a cleared bound leaves the other", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness
        option={optionOf("scene", "bitrate")}
        initial={{ bitrate: { min: 0, max: 4 } }}
        spy={spy}
      />
    );

    expect(screen.getByPlaceholderText("Min")).toHaveValue(0);
    fireEvent.change(screen.getByPlaceholderText("Min"), {
      target: { value: "" },
    });
    expect(lastOf(spy)).toEqual({ bitrate: { max: 4 } });
  });

  it("a date range drops a cleared date", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness
        option={optionOf("scene", "lastPlayedAt")}
        initial={{ lastPlayedAt: { start: "2024-01-01", end: "2024-06-30" } }}
        spy={spy}
      />
    );

    fireEvent.change(screen.getByDisplayValue("2024-06-30"), {
      target: { value: "" },
    });

    expect(lastOf(spy)).toEqual({ lastPlayedAt: { start: "2024-01-01" } });
  });
});

describe("a toggle row", () => {
  it("a toggle row reads the panel's label", () => {
    const spy = vi.fn<(next: PanelState) => void>();
    render(<Harness option={optionOf("performer", "favorite")} spy={spy} />);

    expect(screen.getByText("Favorites Only")).toBeInTheDocument();
    expect(screen.queryByText("Enabled")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(lastOf(spy)).toEqual({ favorite: true });
  });
});

describe("presence", () => {
  it("presence hides the value: Rating Not rated shows no inputs", () => {
    render(
      <Harness
        option={optionOf("scene", "rating")}
        initial={{ rating: { min: 40 }, ratingModifier: "IS_NULL" }}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Rating condition" })
    ).toHaveDisplayValue("Not rated");
    expect(screen.queryByRole("textbox", { name: /Rating$/ })).toBeNull();
  });

  it("presence hides the value: Studios Has none shows no picker", () => {
    render(
      <Harness
        option={optionOf("scene", "studioId")}
        initial={{ studioId: "3:a", studioIdModifier: "IS_NULL" }}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Studios condition" })
    ).toHaveDisplayValue("Has none");
    expect(screen.queryByRole("button", { name: /^Studios/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("an imperial viewer", () => {
  it("an imperial viewer's Height reads feet and inches and stores centimetres", async () => {
    const user = userEvent.setup();
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness option={optionOf("performer", "height", "imperial")} spy={spy} />
    );

    await user.type(
      screen.getByRole("textbox", { name: "Minimum height in feet" }),
      "5"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Minimum height in inches" }),
      "10"
    );

    expect(lastOf(spy)).toEqual({ height: { min: "177" } });
    expect(
      screen.getByRole("textbox", { name: "Minimum height in feet" })
    ).toHaveValue("5");
    expect(
      screen.getByRole("textbox", { name: "Minimum height in inches" })
    ).toHaveValue("10");
  });

  it("an imperial Weight editor keeps its typed text while focused", async () => {
    const user = userEvent.setup();
    const spy = vi.fn<(next: PanelState) => void>();
    render(
      <Harness option={optionOf("performer", "weight", "imperial")} spy={spy} />
    );
    const min = screen.getByLabelText<HTMLInputElement>("Minimum Weight (lbs)");

    for (const [typed, shown] of [
      ["1", "1"],
      ["5", "15"],
      ["0", "150"],
    ] as const) {
      await user.type(min, typed);
      expect(min.value).toBe(shown);
    }
    // At least 150 lbs: the lowest whole kg that shows as 150
    expect(lastOf(spy)).toEqual({ weight: { min: "68" } });
  });
});

describe("the first control", () => {
  it("the first control's id is filter-<key>, or controlId when given", () => {
    const { unmount } = render(
      <Harness option={optionOf("scene", "tagIds")} />
    );
    expect(document.getElementById("filter-tagIds")).toBe(
      screen.getByRole("combobox", { name: "Tags condition" })
    );
    unmount();

    render(
      <Harness option={optionOf("scene", "tagIds")} controlId="row-7-field" />
    );
    expect(document.getElementById("row-7-field")).toBe(
      screen.getByRole("combobox", { name: "Tags condition" })
    );
    expect(document.getElementById("filter-tagIds")).toBeNull();
  });

  it("a row with no condition puts the id on its input", () => {
    render(<Harness option={optionOf("scene", "title")} />);

    expect(document.getElementById("filter-title")).toBe(
      screen.getByRole("textbox", { name: "Title Search" })
    );
  });

  it("autoFocus focuses it once drawn", () => {
    render(<Harness option={optionOf("scene", "title")} autoFocus />);

    expect(screen.getByRole("textbox", { name: "Title Search" })).toHaveFocus();
  });

  it("openPicker opens a ref row's list once drawn, focus in its search box", async () => {
    render(<Harness option={optionOf("scene", "tagIds")} openPicker />);

    const search = await screen.findByPlaceholderText("Type to search...");
    expect(search).toHaveFocus();
    expect(screen.getByRole("button", { name: /^Tags/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("without openPicker a ref row's list stays closed", () => {
    render(<Harness option={optionOf("scene", "tagIds")} />);

    expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
  });

  it("hideLabel keeps the label for assistive technology", () => {
    render(<Harness option={optionOf("scene", "title")} hideLabel />);

    expect(screen.getByText("Title Search")).toHaveClass("sr-only");
    expect(screen.getByRole("textbox", { name: "Title Search" })).toBeVisible();
  });
});

describe("every control is named by the row's label", () => {
  const rows = filterOptionsOf("scene").filter(
    (option) => option.type !== "section-header"
  );

  it.each(rows.map((option) => [option.key, option] as const))(
    "%s",
    (_key, option) => {
      const { container } = render(<Harness option={option} />);

      const controls = [...container.querySelectorAll("input, select, button")];
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        expect(control).toHaveAccessibleName();
      }
      // The label of the row names its first control (the condition, when
      // there is one)
      const first = document.getElementById(`filter-${option.key}`);
      expect(first).not.toBeNull();
      expect(first).toHaveAccessibleName(
        new RegExp(
          (option.label ?? option.key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        )
      );
    }
  );
});
