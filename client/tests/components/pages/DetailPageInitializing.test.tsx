/**
 * A detail page opened while the server's first sync runs: the lookup gets
 * 503 `ready: false`, and the page shows the library-initializing notice
 * (not "Could not load"), then the entity once the library is ready.
 */
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { config, resetDetailPageMocks } from "./detail/detailPageMocks";
import {
  cleanupDetailPage,
  renderDetailPage,
  requestsTo,
} from "./detail/renderDetailPage";

vi.mock("@/components/grids/index", () =>
  import("./detail/detailPageMocks").then((m) => m.gridsModule)
);
vi.mock("@/components/scene-search/SceneSearch", () =>
  import("./detail/detailPageMocks").then((m) => m.sceneSearchModule)
);
vi.mock("@/contexts/CardDisplaySettingsContext", () =>
  import("./detail/detailPageMocks").then((m) => m.cardDisplaySettingsModule)
);
vi.mock("@/contexts/ConfigContext", () =>
  import("./detail/detailPageMocks").then((m) => m.configModule)
);
vi.mock("@/contexts/UnitPreferenceContext", () =>
  import("./detail/detailPageMocks").then((m) => m.unitPreferenceModule)
);
vi.mock("@/hooks/useNavigationState", () =>
  import("./detail/detailPageMocks").then((m) => m.navigationStateModule)
);
vi.mock("@/hooks/useAuth", () =>
  import("./detail/detailPageMocks").then((m) => m.authModule)
);
vi.mock("@/hooks/usePageTitle", () =>
  import("./detail/detailPageMocks").then((m) => m.pageTitleModule)
);
vi.mock("@/themes/useTheme", () =>
  import("./detail/detailPageMocks").then((m) => m.themeModule)
);

describe("a detail page while the library is initializing", () => {
  beforeEach(() => {
    resetDetailPageMocks();
    config.current = { hasMultipleInstances: false };
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanupDetailPage();
    vi.useRealTimers();
  });

  it("shows the notice, not the error page, and loads once the library is ready", async () => {
    const { api } = renderDetailPage("group", "/group/3", {
      entity: { id: "3", instanceId: "a", name: "Big Group" },
      lookup: "initializing",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByText(/Server is syncing library/)).toBeTruthy();
    expect(screen.queryByText(/Could not load/)).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIBRARY_READY_POLL_MS + 50);
    });
    expect(screen.queryByText(/Server is syncing library/)).toBeNull();
    expect(screen.getAllByText("Big Group").length).toBeGreaterThan(0);
    // The lookup was asked again once the library said it was ready
    expect(requestsTo(api, "/library/groups")).toHaveLength(2);
  });
});
