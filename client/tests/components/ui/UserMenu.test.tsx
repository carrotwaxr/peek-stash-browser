import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import UserMenu from "@/components/ui/UserMenu";

let role = "USER";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { username: "alex", role }, logout: vi.fn() }),
}));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false, toggleTVMode: vi.fn() }),
}));
vi.mock("@/components/icons/index", () => ({ ThemedIcon: () => null }));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderMenu(placement?: "below-end" | "right-end", userRole = "USER") {
  role = userRole;
  render(
    <MemoryRouter initialEntries={["/scenes"]}>
      <UserMenu placement={placement} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("UserMenu", () => {
  it("lists Watch History, My Stats, Downloads, TV Mode, Sign Out", async () => {
    const user = userEvent.setup();
    renderMenu("right-end");

    await user.click(screen.getByRole("button", { name: "User menu" }));

    expect(screen.getByRole("link", { name: "Watch History" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My Stats" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Downloads" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /TV Mode/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
  });

  it("shows the role as Admin and User", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("User")).toBeTruthy();
    expect(screen.queryByText("ADMIN")).toBeNull();
  });

  it("labels an admin Admin, not ADMIN", async () => {
    const user = userEvent.setup();
    renderMenu(undefined, "ADMIN");
    await user.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.queryByText("ADMIN")).toBeNull();
  });

  it("Enter on the button opens it and focuses the first item; Escape closes it and refocuses the button", async () => {
    const user = userEvent.setup();
    renderMenu();
    const button = screen.getByRole("button", { name: "User menu" });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    button.focus();
    await user.keyboard("{Enter}");

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Watch History" })
    );

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("link", { name: "Watch History" })).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("a navigation closes it", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "User menu" }));

    await user.click(screen.getByRole("link", { name: "Downloads" }));

    expect(screen.getByTestId("where").textContent).toBe("/downloads");
    expect(screen.queryByRole("link", { name: "Downloads" })).toBeNull();
  });

  it("a click outside closes it", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "User menu" }));

    await user.click(document.body);

    expect(screen.queryByRole("link", { name: "Downloads" })).toBeNull();
  });
});
