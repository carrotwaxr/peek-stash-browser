import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "@/components/ui/Sidebar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { username: "a", role: "USER" }, logout: vi.fn() }),
}));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false, toggleTVMode: vi.fn() }),
}));
vi.mock("@/components/ui/HelpModal", () => ({ default: () => null }));
vi.mock("@/components/icons/index", () => ({ ThemedIcon: () => null }));
vi.mock("@/components/branding/PeekLogo", () => ({ PeekLogo: () => null }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar active states", () => {
  it("lights Settings on /settings", () => {
    renderAt("/settings");

    for (const link of screen.getAllByRole("link", { name: "Settings" })) {
      expect(link.className).toContain("nav-link-active");
    }
  });

  it("lights Performers on a performer page and not Settings", () => {
    renderAt("/performer/3");

    for (const link of screen.getAllByRole("link", { name: "Settings" })) {
      expect(link.className).not.toContain("nav-link-active");
    }
  });
});
