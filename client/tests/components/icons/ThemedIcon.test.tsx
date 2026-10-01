/**
 * ThemedIcon resolves names through a static map, so every name the app
 * passes must have an entry: a missing one would render nothing.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemedIcon } from "@/components/icons/ThemedIcon";
import { NAV_DEFINITIONS } from "@/constants/navigation";
import { iconSets } from "@/themes/icons/iconSets";

vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ currentTheme: "peek" }),
}));

// The literal names written as <ThemedIcon name="..."> in the source
const LITERAL_NAMES = [
  "download",
  "settings",
  "questionCircle",
  "circle-user-round",
  "tv",
  "history",
  "bar-chart-3",
  "logout",
  "list-plus",
  "chevron-up",
  "chevron-down",
];

const setNames = Object.values(iconSets).flatMap((set) =>
  Object.keys(set.icons)
);
const setValues = Object.values(iconSets).flatMap((set) =>
  Object.values(set.icons)
);
const navNames = NAV_DEFINITIONS.map((definition) => definition.icon);

describe("ThemedIcon", () => {
  it.each([
    ...new Set([...setNames, ...setValues, ...navNames, ...LITERAL_NAMES]),
  ])("renders an svg for the name %s", (name) => {
    const { container } = render(<ThemedIcon name={name} />);

    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("an unknown name renders nothing", () => {
    const { container } = render(<ThemedIcon name="no-such-icon" />);

    expect(container.firstChild).toBeNull();
  });

  it("a name that is an Object property renders nothing", () => {
    const { container } = render(<ThemedIcon name="constructor" />);

    expect(container.firstChild).toBeNull();
  });
});
