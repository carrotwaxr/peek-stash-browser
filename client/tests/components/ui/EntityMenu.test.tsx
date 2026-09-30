import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EntityMenu from "../../../src/components/ui/EntityMenu";

describe("EntityMenu", () => {
  it("the hide payload carries the entity's instance", () => {
    const onHide = vi.fn();
    render(
      <EntityMenu
        entityType="performer"
        entityId="12"
        entityName="Jane"
        instanceId="inst-a"
        onHide={onHide}
      />
    );

    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Hide Performer"));

    expect(onHide).toHaveBeenCalledWith({
      entityType: "performer",
      entityId: "12",
      entityName: "Jane",
      instanceId: "inst-a",
    });
  });
});
