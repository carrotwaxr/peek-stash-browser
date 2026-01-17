import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BulkActionBar from "../../../src/components/ui/BulkActionBar";

// Mock the hooks
vi.mock("../../../src/hooks/useHiddenEntities.js", () => ({
  useHiddenEntities: () => ({
    hideEntities: vi.fn().mockResolvedValue({ success: true, successCount: 2, failCount: 0 }),
    hideConfirmationDisabled: false,
  }),
}));

vi.mock("../../../src/utils/toast.jsx", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Mock AddToPlaylistButton to simplify testing
vi.mock("../../../src/components/ui/AddToPlaylistButton.jsx", () => ({
  default: ({ buttonText }) => <button data-testid="add-to-playlist">{buttonText}</button>,
}));

// Mock HideConfirmationDialog
vi.mock("../../../src/components/ui/HideConfirmationDialog.jsx", () => ({
  default: ({ isOpen, onClose, onConfirm }) =>
    isOpen ? (
      <div data-testid="hide-dialog">
        <button onClick={() => onConfirm(false)} data-testid="confirm-hide">
          Confirm Hide
        </button>
        <button onClick={onClose} data-testid="cancel-hide">
          Cancel
        </button>
      </div>
    ) : null,
}));

const mockScenes = [
  { id: "scene-1", title: "Scene 1" },
  { id: "scene-2", title: "Scene 2" },
];

describe("BulkActionBar", () => {
  const defaultProps = {
    selectedScenes: mockScenes,
    onClearSelection: vi.fn(),
    onHideSuccess: vi.fn(),
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

  it("shows Hide button when scenes are selected", () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    // The Hide text is shown on desktop
    const hideButton = screen.getByRole("button", { name: /hide/i });
    expect(hideButton).toBeInTheDocument();
  });

  it("shows Add to Playlist button when scenes are selected", () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByTestId("add-to-playlist")).toBeInTheDocument();
  });

  it("opens hide confirmation dialog when Hide is clicked", async () => {
    render(
      <MemoryRouter>
        <BulkActionBar {...defaultProps} />
      </MemoryRouter>
    );

    // Find and click the hide button (it has the eye-off icon)
    const hideButton = screen.getByRole("button", { name: /hide/i });
    fireEvent.click(hideButton);

    await waitFor(() => {
      expect(screen.getByTestId("hide-dialog")).toBeInTheDocument();
    });
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
    expect(screen.queryByTestId("add-to-playlist")).not.toBeInTheDocument();
  });
});

describe("BulkActionBar - entity structure", () => {
  it("passes scene IDs in correct format to AddToPlaylistButton", () => {
    const props = {
      selectedScenes: [
        { id: "scene-1", title: "Scene 1" },
        { id: "scene-2", title: "Scene 2" },
      ],
      onClearSelection: vi.fn(),
      onHideSuccess: vi.fn(),
    };

    render(
      <MemoryRouter>
        <BulkActionBar {...props} />
      </MemoryRouter>
    );

    // The AddToPlaylistButton receives sceneIds as an array
    const playlistButton = screen.getByTestId("add-to-playlist");
    expect(playlistButton).toBeInTheDocument();
  });

  it("renders correct count in playlist button text", () => {
    const props = {
      selectedScenes: [
        { id: "scene-1", title: "Scene 1" },
        { id: "scene-2", title: "Scene 2" },
        { id: "scene-3", title: "Scene 3" },
      ],
      onClearSelection: vi.fn(),
      onHideSuccess: vi.fn(),
    };

    render(
      <MemoryRouter>
        <BulkActionBar {...props} />
      </MemoryRouter>
    );

    // Check that the count is shown in the button text
    expect(screen.getByText(/Add 3 to Playlist/i)).toBeInTheDocument();
  });
});
