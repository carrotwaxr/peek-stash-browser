import { Link, MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TopBar from "@/components/ui/TopBar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { username: "a", role: "USER" }, logout: vi.fn() }),
}));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false, toggleTVMode: vi.fn() }),
}));
vi.mock("@/components/ui/HelpModal", () => ({ default: () => null }));
vi.mock("@/components/icons/index", () => ({ ThemedIcon: () => null }));
vi.mock("@/components/branding/PeekLogo", () => ({ PeekLogo: () => null }));

async function openMenu() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <TopBar />
      <Link to="/elsewhere">elsewhere</Link>
      <p>page body</p>
    </MemoryRouter>
  );
  await user.click(screen.getByRole("button", { name: "Toggle mobile menu" }));
  return user;
}

const settingsLink = () => screen.queryByRole("link", { name: "Settings" });

describe("TopBar mobile menu", () => {
  it("the open mobile menu has a max height with scrolling", async () => {
    await openMenu();

    const menu = settingsLink()?.closest("ul")?.parentElement;
    expect(menu?.className).toContain("max-h-[calc(100dvh-4rem)]");
    expect(menu?.className).toContain("overflow-y-auto");
  });

  it("Escape closes it", async () => {
    const user = await openMenu();
    expect(settingsLink()).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(settingsLink()).toBeNull();
  });

  it("a click outside closes it", async () => {
    const user = await openMenu();

    await user.click(screen.getByText("page body"));

    expect(settingsLink()).toBeNull();
  });

  it("a route change closes it", async () => {
    const user = await openMenu();

    await user.click(screen.getByRole("link", { name: "elsewhere" }));

    expect(settingsLink()).toBeNull();
  });
});
