import { fireEvent, screen, waitFor } from "@testing-library/react";
import { must, renderWithProviders } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HiddenItemsPage from "@/components/pages/HiddenItemsPage";

const mockApiGet = vi.fn();
const mockApiDelete = vi.fn();

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { hideConfirmationDisabled: false } }),
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const visibleScene = {
  id: 1,
  entityType: "scene",
  entityId: "12",
  instanceId: "",
  hiddenAt: "2026-09-20T00:00:00.000Z",
  restricted: false,
  entity: { id: "12", title: "A visible scene" },
};

// A hidden row the user may no longer see arrives without its entity
const restrictedTag = {
  id: 2,
  entityType: "tag",
  entityId: "7",
  instanceId: "inst-a",
  hiddenAt: "2026-09-21T00:00:00.000Z",
  restricted: true,
  entity: null,
};

describe("HiddenItemsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({
      hiddenEntities: [visibleScene, restrictedTag],
    });
    mockApiDelete.mockResolvedValue({ success: true });
  });

  it("shows a row without details as its type, marked unavailable", async () => {
    renderWithProviders(<HiddenItemsPage />);

    expect(await screen.findByText("A visible scene")).toBeInTheDocument();
    expect(screen.getByText("Tag")).toBeInTheDocument();
    expect(screen.getByText(/Details unavailable/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("restores a row without details on its own instance", async () => {
    renderWithProviders(<HiddenItemsPage />);
    await screen.findByText("Tag");

    const [, tagRestore] = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(must(tagRestore));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/user/hidden-entities/tag/7?instanceId=inst-a"
      )
    );
  });

  it("restores a hide stored for every instance without an instance", async () => {
    renderWithProviders(<HiddenItemsPage />);
    await screen.findByText("A visible scene");

    const [sceneRestore] = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(must(sceneRestore));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/user/hidden-entities/scene/12"
      )
    );
  });
});
