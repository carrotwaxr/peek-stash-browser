import { MemoryRouter, useLocation } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { useGlobalNavigation } from "@/hooks/useGlobalNavigation";

function Shell() {
  useGlobalNavigation();
  return <div data-testid="path">{useLocation().pathname}</div>;
}

const press = (key: string) => {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
};

const goTo = (letter: string) => {
  render(
    <MemoryRouter initialEntries={["/start"]}>
      <ShortcutScopeProvider>
        <Shell />
      </ShortcutScopeProvider>
    </MemoryRouter>
  );
  press("g");
  press(letter);
  return screen.getByTestId("path").textContent;
};

describe("useGlobalNavigation", () => {
  it.each([
    ["s", "/scenes"],
    ["r", "/recommended"],
    ["p", "/performers"],
    ["u", "/studios"],
    ["t", "/tags"],
    ["c", "/collections"],
    ["v", "/collections"],
    ["l", "/galleries"],
    ["i", "/images"],
    ["k", "/clips"],
    ["y", "/playlists"],
    ["z", "/settings"],
  ])("g then %s opens %s", (letter, path) => {
    expect(goTo(letter)).toBe(path);
  });
});
