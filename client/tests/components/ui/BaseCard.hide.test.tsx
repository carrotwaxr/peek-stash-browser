import { MemoryRouter } from "react-router-dom";
import type { NormalizedPerformer } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../../../src/api";
import PerformerCard from "../../../src/components/cards/PerformerCard";
import { BaseCard } from "../../../src/components/ui/BaseCard";
import { showSuccess } from "../../../src/utils/toast";

vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { hideConfirmationDisabled: false },
    updateUser: vi.fn(),
  }),
}));
vi.mock("../../../src/api", () => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(() => Promise.resolve({})),
  apiPut: vi.fn(),
}));
vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showRating: false,
      showFavorite: false,
      showOCounter: false,
      showMenu: true,
      showRelationshipIndicators: false,
    }),
  }),
}));
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

/** Opens the card's menu and presses Hide */
const pressHide = (label: string) => {
  fireEvent.click(screen.getByLabelText("More options"));
  fireEvent.click(screen.getByText(label));
};

describe("a card's hide dialog and toast name the entity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Hide from a performer card's menu asks 'hide Jane Doe?' and toasts 'Jane Doe has been hidden'", async () => {
    renderWithProviders(
      <PerformerCard
        performer={
          {
            id: "7",
            instanceId: "inst-a",
            name: "Jane Doe",
            gender: "FEMALE",
            tags: [],
          } as unknown as NormalizedPerformer
        }
      />
    );

    pressHide("Hide Performer");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Jane Doe")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide" }));

    await vi.waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Jane Doe has been hidden")
    );
    expect(apiPost).toHaveBeenCalledWith(
      "/user/hidden-entities",
      expect.objectContaining({ entityId: "7", instanceId: "inst-a" })
    );
  });

  it("a card with a string title passes it as the hide name", () => {
    renderWithProviders(
      <BaseCard
        entityType="studio"
        title="Acme Studio"
        ratingControlsProps={{
          entityId: "3",
          instanceId: "inst-a",
          showRating: false,
          showFavorite: false,
          showOCounter: false,
          showMenu: true,
        }}
      />
    );

    pressHide("Hide Studio");
    expect(
      within(screen.getByRole("dialog")).getByText("Acme Studio")
    ).toBeInTheDocument();
  });

  it("an explicit entityTitle wins", () => {
    renderWithProviders(
      <BaseCard
        entityType="studio"
        title="Acme Studio"
        ratingControlsProps={{
          entityId: "3",
          instanceId: "inst-a",
          entityTitle: "Acme (named by the card)",
          showRating: false,
          showFavorite: false,
          showOCounter: false,
          showMenu: true,
        }}
      />
    );

    pressHide("Hide Studio");
    expect(
      within(screen.getByRole("dialog")).getByText("Acme (named by the card)")
    ).toBeInTheDocument();
  });

  it("with rating controls hidden and indicators shown, the indicators-row menu's Hide opens the dialog and hides with its instance", async () => {
    const onHideSuccess = vi.fn();
    renderWithProviders(
      <BaseCard
        entityType="tag"
        title="Some Tag"
        indicators={[{ type: "SCENES", count: 4 }]}
        ratingControlsProps={{
          entityId: "9",
          instanceId: "inst-b",
          onHideSuccess,
          showRating: false,
          showFavorite: false,
          showOCounter: false,
          showMenu: true,
        }}
      />
    );

    pressHide("Hide Tag");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Some Tag")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide" }));

    await vi.waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/user/hidden-entities", {
        entityType: "tag",
        entityId: "9",
        instanceId: "inst-b",
      })
    );
    await vi.waitFor(() =>
      expect(onHideSuccess).toHaveBeenCalledWith("9", "tag", "inst-b")
    );
    expect(showSuccess).toHaveBeenCalledWith("Some Tag has been hidden");
  });
});
