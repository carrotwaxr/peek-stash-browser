/**
 * The imperial body-measure editors: an imperial viewer types feet and
 * inches, lbs or inches, and the state holds metric. An input keeps the text
 * typed into it ("5." on the way to "5.5"); it shows text derived from the
 * state only on mount and when the state changes from outside.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterControl } from "@/components/ui/FilterControls";

vi.mock("@/api", () => ({
  libraryApi: {
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
  },
}));

type Measure = "height" | "weight" | "length";

/** The panel's state around one editor, as `SearchControls` holds it */
function Harness({
  measure,
  label,
  initial = {},
  onState,
}: {
  measure: Measure;
  label: string;
  initial?: Record<string, unknown>;
  onState?: (state: unknown) => void;
}) {
  const [state, setState] = useState<unknown>(initial);
  return (
    <>
      <FilterControl
        type={measure === "height" ? "imperial-height-range" : "range"}
        measure={measure}
        label={label}
        value={state}
        onChange={(next) => {
          setState(next);
          onState?.(next);
        }}
      />
      <button type="button" onClick={() => setState({})}>
        Clear
      </button>
      <button type="button" onClick={() => setState({ min: "68", max: "82" })}>
        Load preset
      </button>
      <output data-testid="state">{JSON.stringify(state)}</output>
    </>
  );
}

const stateOf = () =>
  JSON.parse(screen.getByTestId("state").textContent ?? "null") as Record<
    string,
    unknown
  >;

describe("Penis Length in inches", () => {
  it("typing 5.5 shows each step as typed and stores 13.97 cm", async () => {
    const user = userEvent.setup();
    render(<Harness measure="length" label="Penis Length (inches)" />);
    const min = screen.getByLabelText<HTMLInputElement>(
      "Minimum Penis Length (inches)"
    );

    for (const [typed, shown] of [
      ["5", "5"],
      [".", "5."],
      ["5", "5.5"],
    ] as const) {
      await user.type(min, typed);
      expect(min.value).toBe(shown);
    }
    expect(stateOf()).toEqual({ min: "13.97" });
  });

  it("6 in stores 15.24 cm, and the state shows 6 again", () => {
    render(
      <Harness
        measure="length"
        label="Penis Length (inches)"
        initial={{ min: "15.24" }}
      />
    );

    expect(
      screen.getByLabelText<HTMLInputElement>("Minimum Penis Length (inches)")
        .value
    ).toBe("6");
  });

  it("leaving the box tidies the text", async () => {
    const user = userEvent.setup();
    render(<Harness measure="length" label="Penis Length (inches)" />);
    const max = screen.getByLabelText<HTMLInputElement>(
      "Maximum Penis Length (inches)"
    );

    await user.type(max, "7.");
    expect(max.value).toBe("7.");
    await user.tab();

    expect(max.value).toBe("7");
    expect(stateOf()).toEqual({ max: "17.78" });
  });

  it("takes only digits and one point", async () => {
    const user = userEvent.setup();
    render(<Harness measure="length" label="Penis Length (inches)" />);
    const min = screen.getByLabelText<HTMLInputElement>(
      "Minimum Penis Length (inches)"
    );

    await user.type(min, "4a.5.");

    expect(min.value).toBe("4.5");
  });
});

describe("Weight in lbs", () => {
  it("typing 150 shows 1, 15, 150 and never a converted value", async () => {
    const user = userEvent.setup();
    render(<Harness measure="weight" label="Weight (lbs)" />);
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
    expect(stateOf()).toEqual({ min: "68" });
  });

  it("a maximum is the highest whole kg that shows as typed", async () => {
    const user = userEvent.setup();
    render(<Harness measure="weight" label="Weight (lbs)" />);

    await user.type(
      screen.getByLabelText<HTMLInputElement>("Maximum Weight (lbs)"),
      "180"
    );

    expect(stateOf()).toEqual({ max: "81" });
  });

  it("Clear and a preset load replace the text", async () => {
    const user = userEvent.setup();
    render(<Harness measure="weight" label="Weight (lbs)" />);
    const min = screen.getByLabelText<HTMLInputElement>("Minimum Weight (lbs)");
    const max = screen.getByLabelText<HTMLInputElement>("Maximum Weight (lbs)");

    await user.type(min, "150");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(min.value).toBe("");

    await user.click(screen.getByRole("button", { name: "Load preset" }));
    expect(min.value).toBe("150");
    expect(max.value).toBe("181");
  });
});

describe("Height in feet and inches", () => {
  it("shows feet then inches as typed and stores the whole cm range they display as", async () => {
    const user = userEvent.setup();
    render(<Harness measure="height" label="Height (ft/in)" />);
    const feet = screen.getByLabelText<HTMLInputElement>(
      "Minimum height in feet"
    );
    const inches = screen.getByLabelText<HTMLInputElement>(
      "Minimum height in inches"
    );

    await user.type(feet, "5");
    expect(feet.value).toBe("5");
    await user.type(inches, "1");
    expect(inches.value).toBe("1");
    await user.type(inches, "0");
    expect(inches.value).toBe("10");
    expect(feet.value).toBe("5");

    // 5'10" is the lowest of the cm that show as 5'10"
    expect(stateOf()).toEqual({ min: "177" });
  });

  it("a maximum is the highest cm that shows as typed", async () => {
    const user = userEvent.setup();
    render(<Harness measure="height" label="Height (ft/in)" />);

    await user.type(
      screen.getByLabelText<HTMLInputElement>("Maximum height in feet"),
      "6"
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement>("Maximum height in inches"),
      "2"
    );

    expect(stateOf()).toEqual({ max: "189" });
  });

  it("shows a link's centimetres as feet and inches, and Clear empties them", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        measure="height"
        label="Height (ft/in)"
        initial={{ min: "177", max: "189" }}
      />
    );
    const feet = screen.getByLabelText<HTMLInputElement>(
      "Minimum height in feet"
    );
    const inches = screen.getByLabelText<HTMLInputElement>(
      "Minimum height in inches"
    );

    expect([feet.value, inches.value]).toEqual(["5", "10"]);
    expect(
      screen.getByLabelText<HTMLInputElement>("Maximum height in feet").value
    ).toBe("6");
    expect(
      screen.getByLabelText<HTMLInputElement>("Maximum height in inches").value
    ).toBe("2");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect([feet.value, inches.value]).toEqual(["", ""]);
  });

  it("clearing an input clears its bound", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        measure="height"
        label="Height (ft/in)"
        initial={{ min: "177" }}
      />
    );

    await user.clear(
      screen.getByLabelText<HTMLInputElement>("Minimum height in feet")
    );
    await user.clear(
      screen.getByLabelText<HTMLInputElement>("Minimum height in inches")
    );

    expect(stateOf()).toEqual({ min: "" });
  });
});

describe("A field's label and its controls", () => {
  it("the label names the field's first control", () => {
    render(
      <FilterControl
        type="text"
        label="Title"
        controlId="filter-title"
        value=""
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "id",
      "filter-title"
    );
  });

  it("a picker with no condition select is named by the field, and its label points at it", () => {
    render(
      <FilterControl
        type="searchable-select"
        entityType="tags"
        label="Tags"
        controlId="filter-tagIds"
        multi
        value={[]}
        onChange={() => {}}
      />
    );

    const trigger = screen.getByRole("button", { name: /^Tags/ });
    expect(trigger).toHaveAttribute("id", "filter-tagIds");
    expect(screen.getByText("Tags", { selector: "label" })).toHaveAttribute(
      "for",
      "filter-tagIds"
    );
  });

  it("the condition select is named `<label> condition`, and the picker after it is the field's button", () => {
    render(
      <FilterControl
        type="searchable-select"
        entityType="performers"
        label="Performers"
        controlId="filter-performerIds"
        multi
        modifierOptions={[
          { value: "INCLUDES", label: "Has ANY" },
          { value: "EXCLUDES", label: "Has NONE" },
        ]}
        modifierValue="INCLUDES"
        onModifierChange={() => {}}
        value={[]}
        onChange={() => {}}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Performers condition" })
    ).toHaveAttribute("id", "filter-performerIds");
    expect(screen.getByRole("button", { name: /^Performers/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});

describe("every control has a name", () => {
  const CONDITIONS = [
    { value: "EQUALS", label: "is" },
    { value: "GREATER_THAN", label: "above" },
  ];
  const CHOICES = [
    { value: "FULL_HD", label: "1080p" },
    { value: "FOUR_K", label: "4K" },
  ];

  it.each([
    {
      name: "a select with a condition",
      props: {
        type: "select" as const,
        options: CHOICES,
        modifierOptions: CONDITIONS,
        modifierValue: "EQUALS",
      },
      names: ["Resolution condition", "Resolution"],
    },
    {
      name: "a number range",
      props: { type: "range" as const },
      names: ["Minimum Resolution", "Maximum Resolution"],
    },
    {
      name: "a number range with a condition",
      props: {
        type: "range" as const,
        modifierOptions: CONDITIONS,
        modifierValue: "BETWEEN",
      },
      names: [
        "Resolution condition",
        "Minimum Resolution",
        "Maximum Resolution",
      ],
    },
    {
      name: "a date range",
      props: { type: "date-range" as const },
      names: ["Resolution from", "Resolution to"],
    },
    {
      name: "a time range",
      props: { type: "time-range" as const },
      names: ["Resolution start", "Resolution end"],
    },
  ])("$name", ({ props, names }) => {
    const { container } = render(
      <FilterControl
        label="Resolution"
        controlId="field"
        value={undefined}
        onChange={() => {}}
        {...props}
      />
    );

    const controls = [...container.querySelectorAll("input, select")];
    expect(controls).toHaveLength(names.length);
    controls.forEach((control, index) => {
      expect(control).toHaveAccessibleName(names[index]);
    });
  });
});

describe("two height editors on one page", () => {
  it("share no id, and each label names its own input", () => {
    const { container } = render(
      <>
        <Harness measure="height" label="Height (ft/in)" />
        <FilterControl
          type="imperial-height-range"
          measure="height"
          label="Height (ft/in)"
          controlId="height-field"
          value={{}}
          onChange={() => {}}
        />
      </>
    );

    const ids = [...container.querySelectorAll("[id]")].map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The field's own id stays on its first input, where a chip moves focus
    expect(ids).toContain("height-field");
    const labels = [...container.querySelectorAll("fieldset label[for]")];
    expect(labels).toHaveLength(8);
    for (const label of labels) {
      const target = document.getElementById(label.getAttribute("for") ?? "");
      expect(target?.tagName).toBe("INPUT");
      expect(target?.closest("fieldset")).toBe(label.closest("fieldset"));
    }
  });
});
