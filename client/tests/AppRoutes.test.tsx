/**
 * AppRoutes: the route table. Every protected page renders inside one layout
 * route that stays mounted while the visitor moves between pages.
 */
import { type ReactNode, Suspense, useEffect } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppRoutes from "@/AppRoutes";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true },
  layoutMounts: { count: 0 },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: mocks.auth.isAuthenticated,
    isLoading: false,
    user: { id: 1, setupCompleted: true },
  }),
}));

vi.mock("@/components/ui/GlobalLayout", () => {
  const Layout = ({ children }: { children: ReactNode }) => {
    useEffect(() => {
      mocks.layoutMounts.count += 1;
    }, []);
    return <div data-testid="layout">{children}</div>;
  };
  return { default: Layout };
});

vi.mock("@/components/pages/Login", () => ({
  default: () => <div data-testid="page-login" />,
}));
vi.mock("@/components/pages/SetupWizard", () => ({
  default: () => <div data-testid="page-setup" />,
}));
vi.mock("@/components/pages/ForgotPasswordPage", () => ({
  default: () => <div data-testid="page-forgot-password" />,
}));

const stubPages = [
  "Home",
  "Scenes",
  "Recommended",
  "Performers",
  "Studios",
  "Tags",
  "Groups",
  "Galleries",
  "Images",
  "GalleryDetail",
  "GroupDetail",
  "Scene",
  "PerformerDetail",
  "StudioDetail",
  "TagDetail",
  "Playlists",
  "PlaylistDetail",
  "SettingsPage",
  "WatchHistory",
  "UserStats",
  "HiddenItemsPage",
  "Downloads",
  "Clips",
];
for (const name of stubPages) {
  vi.doMock(`@/components/pages/${name}`, () => ({
    default: () => <div data-testid={`page-${name}`} />,
  }));
}
vi.doMock("@/components/carousel-builder/CarouselBuilder", () => ({
  default: () => <div data-testid="page-CarouselBuilder" />,
}));

const STATUS: GetSetupStatusResponse = {
  setupComplete: true,
  hasUsers: true,
  hasStashInstance: true,
  stashInstanceCount: 1,
};

const renderAt = (path: string, extra?: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<div>loading</div>}>
        <AppRoutes setupStatus={STATUS} onSetupComplete={() => {}} />
      </Suspense>
      {extra}
    </MemoryRouter>
  );

const PROTECTED: [string, string][] = [
  ["/", "Home"],
  ["/scenes", "Scenes"],
  ["/recommended", "Recommended"],
  ["/performers", "Performers"],
  ["/studios", "Studios"],
  ["/tags", "Tags"],
  ["/collections", "Groups"],
  ["/galleries", "Galleries"],
  ["/images", "Images"],
  ["/gallery/7", "GalleryDetail"],
  ["/performer/7", "PerformerDetail"],
  ["/studio/7", "StudioDetail"],
  ["/tag/7", "TagDetail"],
  ["/collection/7", "GroupDetail"],
  ["/watch-history", "WatchHistory"],
  ["/user-stats", "UserStats"],
  ["/hidden-items", "HiddenItemsPage"],
  ["/downloads", "Downloads"],
  ["/settings", "SettingsPage"],
  ["/playlists", "Playlists"],
  ["/clips", "Clips"],
  ["/playlist/7", "PlaylistDetail"],
  ["/scene/7", "Scene"],
  ["/settings/carousels/new", "CarouselBuilder"],
  ["/settings/carousels/7/edit", "CarouselBuilder"],
];

describe("AppRoutes", () => {
  beforeEach(() => {
    mocks.auth.isAuthenticated = true;
    mocks.layoutMounts.count = 0;
    sessionStorage.clear();
  });

  it.each(PROTECTED)(
    "%s renders its page inside the layout",
    async (path, name) => {
      renderAt(path);

      const page = await screen.findByTestId(`page-${name}`);
      expect(page.closest('[data-testid="layout"]')).not.toBeNull();
    }
  );

  it("covers all 25 protected paths", () => {
    expect(PROTECTED).toHaveLength(25);
  });

  it("a signed-out visit to a protected path goes to /login", async () => {
    mocks.auth.isAuthenticated = false;
    renderAt("/performer/7");

    expect(await screen.findByTestId("page-login")).toBeInTheDocument();
    expect(screen.queryByTestId("layout")).not.toBeInTheDocument();
  });

  it("/my-settings and /server-settings redirect to their settings tabs", async () => {
    const Probe = () => {
      const location = useLocation();
      return (
        <div data-testid="where">{location.pathname + location.search}</div>
      );
    };

    const first = renderAt("/my-settings", <Probe />);
    expect(await screen.findByTestId("page-SettingsPage")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/settings?section=user&tab=theme"
    );
    first.unmount();

    renderAt("/server-settings", <Probe />);
    expect(await screen.findByTestId("page-SettingsPage")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/settings?section=server&tab=user-management"
    );
  });

  it("an unknown path goes to /", async () => {
    renderAt("/no-such-page");

    expect(await screen.findByTestId("page-Home")).toBeInTheDocument();
  });

  it("the layout is not remounted on navigation", async () => {
    let go: (to: string) => void = () => {};
    const Capture = () => {
      const navigate = useNavigate();
      go = (to) => void navigate(to);
      return null;
    };
    renderAt("/scenes", <Capture />);
    await screen.findByTestId("page-Scenes");
    expect(mocks.layoutMounts.count).toBe(1);

    go("/performers");
    await screen.findByTestId("page-Performers");
    go("/scene/7");
    await screen.findByTestId("page-Scene");

    expect(mocks.layoutMounts.count).toBe(1);
  });
});
