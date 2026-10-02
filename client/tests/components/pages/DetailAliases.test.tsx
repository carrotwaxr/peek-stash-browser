/**
 * A studio's and a collection's page show their aliases under the title.
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDetailPageMocks } from "./detail/detailPageMocks";
import { cleanupDetailPage, renderDetailPage } from "./detail/renderDetailPage";

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

beforeEach(() => {
  resetDetailPageMocks();
});
afterEach(() => {
  cleanupDetailPage();
});

describe("StudioDetail: aliases", () => {
  it("lists the studio's aliases under its name", async () => {
    renderDetailPage("studio", "/studio/5?instance=inst-a", {
      entity: {
        id: "5",
        instanceId: "inst-a",
        name: "Acme",
        aliases: ["A", "B"],
      },
    });

    expect(await screen.findByText("Also known as: A, B")).toBeInTheDocument();
  });

  it("shows no line without aliases", async () => {
    renderDetailPage("studio", "/studio/5?instance=inst-a", {
      entity: { id: "5", instanceId: "inst-a", name: "Acme", aliases: [] },
    });

    await screen.findByText("Acme");
    expect(screen.queryByText(/Also known as/)).not.toBeInTheDocument();
  });
});

describe("GroupDetail: aliases", () => {
  it("shows the collection's aliases as Stash holds them", async () => {
    renderDetailPage("group", "/group/5?instance=inst-a", {
      entity: { id: "5", instanceId: "inst-a", name: "Box", aliases: "A, B" },
    });

    expect(await screen.findByText("Also known as: A, B")).toBeInTheDocument();
  });

  it("shows no line without aliases", async () => {
    renderDetailPage("group", "/group/5?instance=inst-a", {
      entity: { id: "5", instanceId: "inst-a", name: "Box", aliases: null },
    });

    await screen.findByText("Box");
    expect(screen.queryByText(/Also known as/)).not.toBeInTheDocument();
  });
});
