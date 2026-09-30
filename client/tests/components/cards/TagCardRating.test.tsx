import { MemoryRouter } from "react-router-dom";
import type { NormalizedTag } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as apiModule from "../../../src/api";
import { libraryApi } from "../../../src/api";
import TagCard from "../../../src/components/cards/TagCard";
import { getDefaultSettings } from "../../../src/config/entityDisplayConfig";

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return {
    ...actual,
    libraryApi: { ...actual.libraryApi, updateFavorite: vi.fn() },
  };
});
vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { hideConfirmationDisabled: false },
    updateUser: vi.fn(),
  }),
}));
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
// A user who saved nothing: the card gets the defaults for a tag
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: (entityType: string) => getDefaultSettings(entityType),
  }),
}));
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

describe("TagCard with the real BaseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(libraryApi.updateFavorite).mockResolvedValue(undefined);
  });

  it("a tag card shows its rating badge and favorite button, and favoriting calls updateFavorite for the tag", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TagCard
            tag={
              {
                id: "9",
                instanceId: "inst-a",
                name: "Solo",
                scene_count: 4,
                rating100: 80,
                favorite: false,
                o_counter: 0,
              } as unknown as NormalizedTag
            }
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByLabelText("Rating: 8.0")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Add to favorites"));

    await vi.waitFor(() =>
      expect(libraryApi.updateFavorite).toHaveBeenCalledWith(
        "tag",
        "9",
        true,
        "inst-a"
      )
    );
  });
});
