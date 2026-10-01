import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@/components/ui/Sidebar";

let expanded = false;

vi.mock("@/hooks/useHoverCapable", () => ({
  useSharedMediaQuery: (query: string) =>
    query === "(min-width: 1280px)" ? expanded : false,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { username: "alex", role: "USER" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false, toggleTVMode: vi.fn() }),
}));
vi.mock("@/components/ui/HelpModal", () => ({ default: () => null }));
vi.mock("@/components/icons/index", () => ({ ThemedIcon: () => null }));
vi.mock("@/components/branding/PeekLogo", () => ({ PeekLogo: () => null }));

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/scenes"]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    expanded = false;
  });

  it("each nav item is one link", () => {
    renderSidebar();
    expect(screen.getAllByRole("link", { name: "Scenes" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Performers" })).toHaveLength(1);
  });

  it("shows a label beside each icon, hidden below xl", () => {
    renderSidebar();
    const label = screen.getByText("Scenes");
    expect(label.className).toContain("hidden");
    expect(label.className).toContain("xl:inline");
  });

  it("collapsed shows the tooltip on hover, expanded does not", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSidebar();
    // The label is always in the markup (CSS hides it below xl)
    expect(screen.getAllByText("Scenes")).toHaveLength(1);
    await user.hover(screen.getByRole("link", { name: "Scenes" }));
    expect(await screen.findAllByText("Scenes")).toHaveLength(2);
    unmount();

    expanded = true;
    renderSidebar();
    await user.hover(screen.getByRole("link", { name: "Scenes" }));
    expect(screen.getAllByText("Scenes")).toHaveLength(1);
  });

  it.each([false, true])(
    "Help, Settings and the user menu each render once (expanded: %s)",
    (isExpanded) => {
      expanded = isExpanded;
      renderSidebar();

      expect(screen.getAllByRole("button", { name: "Help" })).toHaveLength(1);
      expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1);
      expect(
        screen.getAllByRole("button", {
          name: isExpanded ? "alex" : "User menu",
        })
      ).toHaveLength(1);
    }
  );

  it("expanded opens the user's items under the username", async () => {
    expanded = true;
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole("button", { name: "alex" }));
    expect(screen.getByRole("link", { name: "Downloads" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
  });
});
