import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BulkActionBar from "../../../src/components/ui/BulkActionBar";

const mockScenes = [
  { id: "scene-1", title: "Scene 1" },
  { id: "scene-2", title: "Scene 2" },
];

describe("BulkActionBar", () => {
  const defaultProps = {
    selectedScenes: mockScenes,
    onClearSelection: vi.fn(),
    actions: <button data-testid="test-action">Test Action</button>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with correct selection count", () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("scenes")).toBeInTheDocument();
  });

  it("shows singular 'scene' for single selection", () => {
    render(
      <MemoryRouter>
        <BulkActionBar
          {...defaultProps}
          selectedScenes={[{ id: "scene-1", title: "Scene 1" }]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("scene")).toBeInTheDocument();
  });

  it("shows Clear button when scenes are selected", () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls onClearSelection when Clear is clicked", () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Clear"));
    expect(defaultProps.onClearSelection).toHaveBeenCalled();
  });

  it("renders provided actions when scenes are selected", () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByTestId("test-action")).toBeInTheDocument();
  });

  it("does not render actions when no scenes selected", () => {
    render(
      <MemoryRouter>
        <BulkActionBar
          {...defaultProps}
          selectedScenes={[]}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-action")).not.toBeInTheDocument();
  });

  it("renders multiple actions", () => {
    render(
      <MemoryRouter>
        <BulkActionBar
          {...defaultProps}
          actions={
            <>
              <button data-testid="action-1">Action 1</button>
              <button data-testid="action-2">Action 2</button>
            </>
          }
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("action-1")).toBeInTheDocument();
    expect(screen.getByTestId("action-2")).toBeInTheDocument();
  });
});
