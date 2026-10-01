/**
 * The help dialog is its own chunk (D4). When it fails to load (a network
 * blip, a new version), the Sidebar and the TopBar stay on screen and say
 * so; the app is never replaced by the root error screen.
 */
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "@/components/ui/Sidebar";
import TopBar from "@/components/ui/TopBar";
import { showError } from "@/utils/toast";

vi.mock("@/hooks/useHoverCapable", () => ({
  useSharedMediaQuery: () => false,
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
// The chunk cannot be fetched
vi.mock("@/components/ui/HelpModal", () => {
  throw new TypeError(
    "Failed to fetch dynamically imported module: /assets/HelpModal.js"
  );
});
vi.mock("@/components/icons/index", () => ({ ThemedIcon: () => null }));
vi.mock("@/components/branding/PeekLogo", () => ({ PeekLogo: () => null }));
vi.mock("@/utils/toast", () => ({ showError: vi.fn() }));

describe("a help dialog that fails to load", () => {
  it.each([
    ["Sidebar", () => <Sidebar />],
    ["TopBar", () => <TopBar />],
  ])(
    "leaves the %s in place and says help could not open",
    async (_name, bar) => {
      vi.mocked(showError).mockClear();
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/scenes"]}>
          {bar()}
          <p>page body</p>
        </MemoryRouter>
      );

      await user.click(
        must(screen.getAllByRole("button", { name: "Help" })[0])
      );

      await waitFor(() =>
        expect(showError).toHaveBeenCalledWith("Couldn't open help")
      );
      expect(screen.getByText("page body")).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Help" }).length
      ).toBeGreaterThan(0);
    }
  );
});
