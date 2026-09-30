/**
 * The Scenes page: the scene list under its own title, and cards that keep
 * their props across a refetch, so a memoised card renders again only when
 * its own row changed (the grid hands every card the page's one click
 * handler, never a closure per card).
 */
import { act, screen, waitFor } from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Scenes from "@/components/pages/Scenes";
import { usePageTitle } from "@/hooks/usePageTitle";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

const { api, renders, clickHandlers } = vi.hoisted(() => ({
  api: { findScenes: vi.fn<Find>() },
  /** Renders per card, by scene id */
  renders: new Map<string, number>(),
  /** Every click handler a card was given */
  clickHandlers: new Set<unknown>(),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/api/library", () => ({ libraryApi: api }));
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({}),
  apiDelete: vi.fn().mockResolvedValue({}),
  libraryApi: {
    ...api,
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/hooks/useTableColumns", () => ({
  useTableColumns: vi.fn(() => ({
    allColumns: [],
    visibleColumns: [],
    visibleColumnIds: [],
    columnOrder: [],
    toggleColumn: vi.fn(),
    hideColumn: vi.fn(),
    moveColumn: vi.fn(),
    getColumnConfig: vi.fn(() => ({})),
  })),
}));

// A memoised card, as the real one is: it renders only when a prop changed,
// and counts its renders
vi.mock("@/components/ui/SceneCard", async () => {
  const { memo, forwardRef } = await import("react");
  const CountingCard = memo(
    forwardRef<
      HTMLDivElement,
      {
        scene: { id: string; title: string; rating100?: number };
        onClick?: unknown;
      }
    >(({ scene, onClick }, ref) => {
      renders.set(scene.id, (renders.get(scene.id) ?? 0) + 1);
      clickHandlers.add(onClick);
      return (
        <div ref={ref} data-testid="scene-card">
          {scene.title} {scene.rating100 ?? ""}
        </div>
      );
    })
  );
  return { default: CountingCard };
});

/** What the server holds; each fetch answers a fresh copy of it */
let serverRows: Record<string, unknown>[] = [];

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    instanceId: "a",
    title: `Scene ${i}`,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  renders.clear();
  clickHandlers.clear();
  serverRows = rows(12);
  api.findScenes.mockImplementation(() =>
    Promise.resolve({
      findScenes: {
        count: serverRows.length,
        scenes: structuredClone(serverRows),
      },
    })
  );
});

const renderScenes = async () => {
  const view = renderListPage(<Scenes />, { initialEntries: ["/scenes"] });
  await waitFor(() =>
    expect(screen.getAllByTestId("scene-card")).toHaveLength(12)
  );
  return view;
};

/** Refetches the scene list and waits for the answer to be drawn */
const refetch = async (
  queryClient: ReturnType<typeof renderListPage>["queryClient"]
) => {
  const before = api.findScenes.mock.calls.length;
  await act(() => queryClient.refetchQueries({ queryKey: ["scenes"] }));
  await waitFor(() =>
    expect(api.findScenes.mock.calls.length).toBeGreaterThan(before)
  );
};

describe("Scenes", () => {
  it("sets page title to 'Scenes' and heads the list 'All Scenes'", async () => {
    await renderScenes();
    expect(usePageTitle).toHaveBeenCalledWith("Scenes");
    expect(
      screen.getByRole("heading", { name: "All Scenes" })
    ).toBeInTheDocument();
  });

  it("lists by date added unless the URL or a preset says otherwise", async () => {
    await renderScenes();
    const params = must(api.findScenes.mock.lastCall)[0];
    expect(params.filter).toMatchObject({
      sort: "created_at",
      direction: "DESC",
    });
  });

  it("every card gets the page's one click handler, not a closure per card", async () => {
    await renderScenes();
    expect(clickHandlers.size).toBe(1);
    expect([...clickHandlers][0]).toBeTypeOf("function");
  });

  it("a refetch with unchanged rows renders each scene card once", async () => {
    const { queryClient } = await renderScenes();

    await refetch(queryClient);

    expect(renders.size).toBe(12);
    expect([...new Set(renders.values())]).toEqual([1]);
  });

  it("a rating change from the server renders only that scene's card again", async () => {
    const { queryClient } = await renderScenes();

    serverRows = serverRows.map((scene) =>
      scene.id === "5" ? { ...scene, rating100: 40 } : scene
    );
    await refetch(queryClient);

    await waitFor(() =>
      expect(screen.getByText("Scene 5 40")).toBeInTheDocument()
    );
    expect(renders.get("5")).toBe(2);
    const others = [...renders.entries()].filter(([id]) => id !== "5");
    expect(new Set(others.map(([, count]) => count))).toEqual(new Set([1]));
  });
});
