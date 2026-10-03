import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntityMenu from "../../../src/components/ui/EntityMenu";
import {
  MOUSE_QUERIES,
  TOUCH_QUERIES,
  matchMediaQueries,
} from "../../helpers/matchMedia";

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

describe("EntityMenu reserved space", () => {
  const props = {
    entityType: "scene",
    entityId: "7",
    entityName: "A scene",
    instanceId: "inst-a",
  };

  it("with reserveSpace and nothing to offer, a spacer of the button's width stands in", () => {
    render(
      <EntityMenu {...props} oCount={0} onRemoveLastO={vi.fn()} reserveSpace />
    );

    expect(screen.queryByLabelText("More options")).toBeNull();
    const spacer = screen.getByTestId("entity-menu-spacer");
    expect(spacer).toHaveClass("w-[26px]");
    expect(spacer).toHaveAttribute("aria-hidden", "true");
  });

  it("the button takes the spacer's width, so the first O moves nothing", () => {
    render(
      <EntityMenu {...props} oCount={1} onRemoveLastO={vi.fn()} reserveSpace />
    );

    expect(screen.queryByTestId("entity-menu-spacer")).toBeNull();
    const button = screen.getByLabelText("More options");
    expect(button.parentElement).toHaveClass("w-[26px]");
  });

  it("without reserveSpace nothing stands in", () => {
    render(<EntityMenu {...props} oCount={0} onRemoveLastO={vi.fn()} />);

    expect(screen.queryByTestId("entity-menu-spacer")).toBeNull();
  });
});

describe("EntityMenu hit area", () => {
  let restoreMedia: (() => void) | null = null;
  afterEach(() => {
    restoreMedia?.();
    restoreMedia = null;
  });

  const menu = (
    <EntityMenu
      entityType="scene"
      entityId="7"
      entityName="A scene"
      instanceId="inst-a"
      onHide={vi.fn()}
    />
  );

  it("on a coarse pointer the menu button has a 44 px hit area", () => {
    restoreMedia = matchMediaQueries(TOUCH_QUERIES);
    render(menu);

    const button = screen.getByLabelText("More options");

    // Drawn by a ::before outset from the button: its box is unchanged
    expect(button.className).toContain("relative");
    expect(button.className).toContain("before:absolute");
    expect(button.className).toContain("before:-inset-[9px]");
  });

  it("with a mouse the menu button has no extra hit area", () => {
    restoreMedia = matchMediaQueries(MOUSE_QUERIES);
    render(menu);

    expect(screen.getByLabelText("More options").className).not.toContain(
      "before:"
    );
  });
});
