/**
 * RuleEditor's entity picker, with the real SearchableSelect: a carousel
 * rule lists what its owner sees, so the picker asks the `/minimal`
 * endpoints with no scope, for its options and for the names of the rule's
 * ids. Only the Content Restrictions editor sends `scope: "allEnabled"`
 * (tests/components/settings/ContentRestrictionsModalPickers.test.tsx).
 */
import type { MinimalEntity, MinimalRequest } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "../../../src/api";
import RuleEditor from "../../../src/components/carousel-builder/RuleEditor";

type FindMinimalMock = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;

const { mockFindTagsMinimal } = vi.hoisted(() => ({
  mockFindTagsMinimal: vi.fn<FindMinimalMock>(),
}));

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    libraryApi: { ...actual.libraryApi, findTagsMinimal: mockFindTagsMinimal },
  };
});

describe("RuleEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the carousel rule picker sends no scope, for its options or for its ids' names", async () => {
    mockFindTagsMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? [{ id: "5", instanceId: "server-a", name: "Rule Tag" }]
          : []
      )
    );

    render(
      <RuleEditor
        rule={{
          id: "rule-1",
          filterKey: "tagIds",
          value: ["5:server-a"],
          modifier: "INCLUDES",
        }}
        usedFilterKeys={new Set(["tagIds"])}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(await screen.findByText("Rule Tag")).toBeInTheDocument();
    expect(mockFindTagsMinimal).toHaveBeenCalledTimes(1);
    expect(must(mockFindTagsMinimal.mock.calls[0])[0]).toEqual({
      ids: ["5:server-a"],
      filter: { per_page: 100 },
    });

    fireEvent.click(screen.getByText("Rule Tag"));
    await waitFor(() => {
      expect(mockFindTagsMinimal).toHaveBeenCalledTimes(2);
    });
    expect(must(mockFindTagsMinimal.mock.calls[1])[0]).toEqual({
      filter: { per_page: 50 },
    });
  });
});
