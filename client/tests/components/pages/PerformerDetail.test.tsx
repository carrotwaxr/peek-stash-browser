/**
 * A performer page's Links card: every link Stash holds for the performer,
 * not only the first.
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

const performer = {
  id: "5",
  instanceId: "inst-a",
  name: "Ann",
};

beforeEach(() => {
  resetDetailPageMocks();
});
afterEach(() => {
  cleanupDetailPage();
});

describe("PerformerDetail: Links", () => {
  it("shows every link", async () => {
    renderDetailPage("performer", "/performer/5?instance=inst-a", {
      entity: {
        ...performer,
        url: "https://one.example/ann",
        urls: ["https://one.example/ann", "https://two.example/ann"],
      },
    });

    const links = await screen.findAllByRole("link", { name: /example/i });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://one.example/ann",
      "https://two.example/ann",
    ]);
  });

  it("shows the one url of a row from before the re-fetch", async () => {
    renderDetailPage("performer", "/performer/5?instance=inst-a", {
      entity: { ...performer, url: "https://one.example/ann", urls: [] },
    });

    const links = await screen.findAllByRole("link", { name: /example/i });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://one.example/ann",
    ]);
  });

  it("shows no Links card without a link", async () => {
    renderDetailPage("performer", "/performer/5?instance=inst-a", {
      entity: { ...performer, url: null, urls: [] },
    });

    await screen.findByText("Ann");
    expect(screen.queryByText("Links")).not.toBeInTheDocument();
  });
});
