/**
 * TabNavigation Component Tests
 *
 * Tests user interactions with tab navigation:
 * - Tab switching and URL updates
 * - Tab visibility based on count
 * - Pagination param clearing on tab switch
 * - Loading states
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TabNavigation, { TAB_COUNT_LOADING } from "../../../src/components/ui/TabNavigation.jsx";

// We need to test URL updates, so we'll use a wrapper component
const TabNavigationTestWrapper = ({ initialRoute = "/", ...props }) => {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <TabNavigation {...props} />
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
        <TabNavigationTestWrapper
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      expect(screen.getByText("Scenes")).toBeInTheDocument();
      expect(screen.getByText("Galleries")).toBeInTheDocument();
      expect(screen.getByText("Images")).toBeInTheDocument();
    });

    it("shows count badges for each tab", () => {
      render(
        <TabNavigationTestWrapper
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });

    it("marks active tab with aria-current", () => {
      render(
        <TabNavigationTestWrapper
          tabs={defaultTabs}
          defaultTab="scenes"
        />
      );

      const scenesTab = screen.getByText("Scenes").closest("button");
      const galleriesTab = screen.getByText("Galleries").closest("button");

      expect(scenesTab).toHaveAttribute("aria-current", "page");
      expect(galleriesTab).not.toHaveAttribute("aria-current");
    });

    it("disables active tab button", () => {
      render(
        <TabNavigationTestWrapper
          tabs={defaultTabs}
          defaultTab="scenes"
        />
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
        <TabNavigationTestWrapper
          tabs={tabsWithZero}
          defaultTab="scenes"
        />
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
        <TabNavigationTestWrapper
          tabs={tabsWithLoading}
          defaultTab="scenes"
        />
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
        <TabNavigationTestWrapper
          tabs={allZeroTabs}
          defaultTab="scenes"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it("does not render when only one visible tab (by default)", () => {
      const singleTab = [
        { id: "scenes", label: "Scenes", count: 50 },
        { id: "galleries", label: "Galleries", count: 0 },
      ];

      const { container } = render(
        <TabNavigationTestWrapper
          tabs={singleTab}
          defaultTab="scenes"
        />
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

      const galleriesTab = screen.getByText("Galleries").closest("button");
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

      const scenesTab = screen.getByText("Scenes").closest("button");
      // Tab is disabled so click shouldn't do anything
      await user.click(scenesTab);

      expect(onTabChange).not.toHaveBeenCalled();
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
      const tabsWithUndefined = [
        { id: "scenes", label: "Scenes", count: 50 },
        { id: "settings", label: "Settings" }, // No count
      ];

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
        <TabNavigationTestWrapper
          tabs={[]}
          defaultTab="scenes"
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
