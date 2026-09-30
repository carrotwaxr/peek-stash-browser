/**
 * TabNavigation Component Tests
 *
 * Tests user interactions with tab navigation:
 * - Tab switching and URL updates
 * - Tab visibility based on count
 * - Pagination param clearing on tab switch
 * - Loading states
 */
import { MemoryRouter, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabNavigation, {
  TAB_COUNT_LOADING,
} from "../../../src/components/ui/TabNavigation";
import { switchTabParams } from "../../../src/utils/urlParams";

const CurrentSearch = () => (
  <output data-testid="search">{useLocation().search}</output>
);

// We need to test URL updates, so we'll use a wrapper component
const TabNavigationTestWrapper = ({
  initialRoute = "/",
  showSearch = false,
  ...props
}: {
  initialRoute?: string;
  /** Renders the URL's query string as `search` */
  showSearch?: boolean;
} & React.ComponentProps<typeof TabNavigation>) => {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <TabNavigation {...props} />
      {showSearch && <CurrentSearch />}
    </MemoryRouter>
  );
};

describe("TabNavigation", () => {
  const defaultTabs = [
    { id: "scenes", label: "Scenes", count: 50 },
    { id: "galleries", label: "Galleries", count: 10 },
    { id: "images", label: "Images", count: 25 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders all visible tabs", () => {
      render(
        <TabNavigationTestWrapper tabs={defaultTabs} defaultTab="scenes" />
      );

      expect(screen.getByText("Scenes")).toBeInTheDocument();
      expect(screen.getByText("Galleries")).toBeInTheDocument();
      expect(screen.getByText("Images")).toBeInTheDocument();
    });

    it("shows count badges for each tab", () => {
      render(
        <TabNavigationTestWrapper tabs={defaultTabs} defaultTab="scenes" />
      );

      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });

    it("marks active tab with aria-current", () => {
      render(
        <TabNavigationTestWrapper tabs={defaultTabs} defaultTab="scenes" />
      );

      const scenesTab = screen.getByText("Scenes").closest("button");
      const galleriesTab = screen.getByText("Galleries").closest("button");

      expect(scenesTab).toHaveAttribute("aria-current", "page");
      expect(galleriesTab).not.toHaveAttribute("aria-current");
    });

    it("disables active tab button", () => {
      render(
        <TabNavigationTestWrapper tabs={defaultTabs} defaultTab="scenes" />
      );

      const scenesTab = screen.getByText("Scenes").closest("button");
      expect(scenesTab).toBeDisabled();
    });
  });

  describe("Tab Visibility", () => {
    it("hides tabs with count of 0", () => {
      const tabsWithZero = [
        { id: "scenes", label: "Scenes", count: 50 },
        { id: "galleries", label: "Galleries", count: 0 },
        { id: "images", label: "Images", count: 25 },
      ];

      render(
        <TabNavigationTestWrapper tabs={tabsWithZero} defaultTab="scenes" />
      );

      expect(screen.getByText("Scenes")).toBeInTheDocument();
      expect(screen.queryByText("Galleries")).not.toBeInTheDocument();
      expect(screen.getByText("Images")).toBeInTheDocument();
    });

    it("shows tabs with TAB_COUNT_LOADING without badge", () => {
      const tabsWithLoading = [
        { id: "scenes", label: "Scenes", count: TAB_COUNT_LOADING },
        { id: "galleries", label: "Galleries", count: 10 },
      ];

      render(
        <TabNavigationTestWrapper tabs={tabsWithLoading} defaultTab="scenes" />
      );

      // Tab should be visible
      expect(screen.getByText("Scenes")).toBeInTheDocument();
      // Should not show -1 as badge
      expect(screen.queryByText("-1")).not.toBeInTheDocument();
      // Galleries badge should still show
      expect(screen.getByText("10")).toBeInTheDocument();
    });

    it("does not render when no visible tabs", () => {
      const allZeroTabs = [
        { id: "scenes", label: "Scenes", count: 0 },
        { id: "galleries", label: "Galleries", count: 0 },
      ];

      const { container } = render(
        <TabNavigationTestWrapper tabs={allZeroTabs} defaultTab="scenes" />
      );

      expect(container.firstChild).toBeNull();
    });

    it("does not render when only one visible tab (by default)", () => {
      const singleTab = [
        { id: "scenes", label: "Scenes", count: 50 },
        { id: "galleries", label: "Galleries", count: 0 },
      ];

      const { container } = render(
        <TabNavigationTestWrapper tabs={singleTab} defaultTab="scenes" />
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders single tab when showSingleTab is true", () => {
      const singleTab = [
        { id: "scenes", label: "Scenes", count: 50 },
        { id: "galleries", label: "Galleries", count: 0 },
      ];

      render(
        <TabNavigationTestWrapper
          tabs={singleTab}
          defaultTab="scenes"
          showSingleTab={true}
        />
      );

      expect(screen.getByText("Scenes")).toBeInTheDocument();
    });
  });

  describe("Tab Switching", () => {
    it("calls onTabChange when tab clicked", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();

      render(
        <TabNavigationTestWrapper
          tabs={defaultTabs}
          defaultTab="scenes"
          onTabChange={onTabChange}
        />
      );

      const galleriesTab = must(
        screen.getByText("Galleries").closest("button")
      );
      await user.click(galleriesTab);

      expect(onTabChange).toHaveBeenCalledWith("galleries");
    });

    it("does not call onTabChange when clicking active tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();

      render(
        <TabNavigationTestWrapper
          tabs={defaultTabs}
          defaultTab="scenes"
          onTabChange={onTabChange}
        />
      );

      const scenesTab = must(screen.getByText("Scenes").closest("button"));
      // Tab is disabled so click shouldn't do anything
      await user.click(scenesTab);

      expect(onTabChange).not.toHaveBeenCalled();
    });
  });

  describe("a tab switch starts the new tab clean", () => {
    it("switching from Scenes to Galleries drops favorite, tagIds, view, page and folderPath and keeps instance and includeSubTags", async () => {
      const user = userEvent.setup();
      render(
        <TabNavigationTestWrapper
          showSearch
          initialRoute="/tag/5?instance=a&includeSubTags=true&favorite=true&tagIds=1%3Aa&view=wall&page=7&folderPath=x&image=9%3Aa&sort=title&q=cat"
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      await user.click(must(screen.getByText("Galleries").closest("button")));

      const params = new URLSearchParams(
        screen.getByTestId("search").textContent ?? ""
      );
      expect(Object.fromEntries(params)).toEqual({
        instance: "a",
        includeSubTags: "true",
        tab: "galleries",
      });
    });

    it("switching to the default tab drops the tab param", async () => {
      const user = userEvent.setup();
      render(
        <TabNavigationTestWrapper
          showSearch
          initialRoute="/?instance=a&tab=galleries&page=3"
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      await user.click(must(screen.getByText("Scenes").closest("button")));

      expect(screen.getByTestId("search").textContent).toBe("?instance=a");
    });
  });

  describe("switchTabParams", () => {
    it("leaves the given params untouched and returns new ones", () => {
      const params = new URLSearchParams("page=2&instance=a");
      const next = switchTabParams(params, "images", "scenes");

      expect(params.toString()).toBe("page=2&instance=a");
      expect(next.toString()).toBe("instance=a&tab=images");
    });
  });

  describe("URL Integration", () => {
    it("reads active tab from URL query parameter", () => {
      render(
        <TabNavigationTestWrapper
          initialRoute="/?tab=galleries"
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      const galleriesTab = screen.getByText("Galleries").closest("button");
      expect(galleriesTab).toHaveAttribute("aria-current", "page");
      expect(galleriesTab).toBeDisabled();
    });

    it("uses default tab when no URL parameter", () => {
      render(
        <TabNavigationTestWrapper
          initialRoute="/"
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      const scenesTab = screen.getByText("Scenes").closest("button");
      expect(scenesTab).toHaveAttribute("aria-current", "page");
    });
  });

  describe("Edge Cases", () => {
    it("handles tabs with undefined count", () => {
      const tabsWithUndefined = untrusted<
        React.ComponentProps<typeof TabNavigation>["tabs"]
      >([
        { id: "scenes", label: "Scenes", count: 50 },
        { id: "settings", label: "Settings" }, // No count
      ]);

      render(
        <TabNavigationTestWrapper
          tabs={tabsWithUndefined}
          defaultTab="scenes"
          showSingleTab={true}
        />
      );

      // Should render Scenes with count
      expect(screen.getByText("Scenes")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
      // Settings should not be visible (undefined count treated as 0)
    });

    it("handles empty tabs array", () => {
      const { container } = render(
        <TabNavigationTestWrapper tabs={[]} defaultTab="scenes" />
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
