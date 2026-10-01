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

describe("EntityMenu items", () => {
  const props = {
    entityType: "scene",
    entityId: "7",
    entityName: "A scene",
    instanceId: "inst-a",
  };

  it("offers Remove last O when the O count is above 0, and calls it", () => {
    const onRemoveLastO = vi.fn();
    render(<EntityMenu {...props} oCount={2} onRemoveLastO={onRemoveLastO} />);

    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Remove last O"));

    expect(onRemoveLastO).toHaveBeenCalledTimes(1);
    // The menu closes
    expect(screen.queryByText("Remove last O")).toBeNull();
  });

  it("the menu offers no Remove last O at 0 Os", () => {
    render(
      <EntityMenu
        {...props}
        oCount={0}
        onRemoveLastO={vi.fn()}
        onHide={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("More options"));

    expect(screen.getByText("Hide Scene")).toBeInTheDocument();
    expect(screen.queryByText("Remove last O")).toBeNull();
  });

  it("the Hide item renders only when onHide is given", () => {
    render(<EntityMenu {...props} oCount={1} onRemoveLastO={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("More options"));

    expect(screen.getByText("Remove last O")).toBeInTheDocument();
    expect(screen.queryByText("Hide Scene")).toBeNull();
  });

  it("a menu with no item to show renders no button", () => {
    render(<EntityMenu {...props} oCount={0} onRemoveLastO={vi.fn()} />);

    expect(screen.queryByLabelText("More options")).toBeNull();
  });
});
