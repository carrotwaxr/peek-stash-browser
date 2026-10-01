import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncludeSubToggle from "@/components/detail/IncludeSubToggle";
import { renderDetailPart } from "./renderDetailPart";

describe("IncludeSubToggle", () => {
  it("ticking sets the param and clears the page", () => {
    const { search } = renderDetailPart(
      <IncludeSubToggle
        param="includeSubTags"
        label="Include sub-tags"
        count={3}
      />,
      { url: "/tag/5?tab=galleries&page=4" }
    );
    const box = screen.getByRole("checkbox", { name: "Include sub-tags (3)" });
    expect(box).not.toBeChecked();

    fireEvent.click(box);

    expect(box).toBeChecked();
    expect(search()).toEqual({ tab: "galleries", includeSubTags: "true" });
  });

  it("unticking removes the param and clears the page", () => {
    const { search } = renderDetailPart(
      <IncludeSubToggle
        param="includeSubStudios"
        label="Include sub-studios"
        count={2}
      />,
      { url: "/studio/5?includeSubStudios=true&page=2" }
    );
    const box = screen.getByRole("checkbox", {
      name: "Include sub-studios (2)",
    });
    expect(box).toBeChecked();

    fireEvent.click(box);

    expect(box).not.toBeChecked();
    expect(search()).toEqual({});
  });
});
