/**
 * The Content Restrictions editor's pickers, with the real SearchableSelect
 * (task L3): an admin restricts content on every enabled Stash server,
 * whichever servers they browse, so each picker asks the `/minimal`
 * endpoints with `scope: "allEnabled"`, for its options and for the names
 * of the stored ids (a stored id on another server shows its name). The
 * carousel rule picker sends no scope (tests/components/carousel-builder).
 */
import type { MinimalEntity, MinimalRequest } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "../../../src/api";
import ContentRestrictionsModal from "../../../src/components/settings/ContentRestrictionsModal";

type FindMinimalMock = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;

const { mockApiGet, mockApiPut, finders } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
  finders: {
    findPerformersMinimal: vi.fn<FindMinimalMock>(),
    findStudiosMinimal: vi.fn<FindMinimalMock>(),
    findTagsMinimal: vi.fn<FindMinimalMock>(),
    findGroupsMinimal: vi.fn<FindMinimalMock>(),
    findGalleriesMinimal: vi.fn<FindMinimalMock>(),
  },
}));

// The restrictions load and save, and the five pickers' endpoints, are
// stubbed; the rest of the module is real
vi.mock("../../../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
  libraryApi: finders,
}));

const user = { id: 1, username: "restricted" };

describe("ContentRestrictionsModal pickers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const find of Object.values(finders)) find.mockResolvedValue([]);
  });

  it("the restrictions editor's pickers send scope allEnabled, for their options and for the stored ids' names", async () => {
    mockApiGet.mockResolvedValue({
      restrictions: [
        {
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: ["5:other-server"],
          restrictEmpty: true,
          unreadable: false,
        },
      ],
    });
    finders.findTagsMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? [{ id: "5", instanceId: "other-server", name: "Other Tag" }]
          : []
      )
    );

    render(<ContentRestrictionsModal user={user} onClose={vi.fn()} />);

    // The stored id on another server resolves to its name
    expect(await screen.findByText("Other Tag")).toBeInTheDocument();
    expect(finders.findTagsMinimal).toHaveBeenCalledTimes(1);
    expect(must(finders.findTagsMinimal.mock.calls[0])[0]).toEqual({
      ids: ["5:other-server"],
      filter: { per_page: 100 },
      scope: "allEnabled",
    });

    // Opening a picker lists every enabled server's entities
    fireEvent.click(screen.getByText("Always hide these studios..."));
    await waitFor(() => {
      expect(finders.findStudiosMinimal).toHaveBeenCalledTimes(1);
    });
    expect(must(finders.findStudiosMinimal.mock.calls[0])[0]).toEqual({
      filter: { per_page: 50 },
      scope: "allEnabled",
    });
  });
});
