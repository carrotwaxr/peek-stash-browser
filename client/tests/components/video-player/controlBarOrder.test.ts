/**
 * addOrderedControl keeps the player's new buttons in one order (VR, AirPlay,
 * Cast, fullscreen) whichever of them is added first.
 */
import { untrusted } from "@tests/helpers/untrusted";
import { describe, expect, it } from "vitest";
import {
  CONTROL_BAR_ORDER,
  type ControlBarPlayer,
  addOrderedControl,
} from "@/components/video-player/controlBarOrder";

interface FakeChild {
  name_: string;
}

function makePlayer(withFullscreen = true) {
  const children: FakeChild[] = [
    { name_: "playToggle" },
    { name_: "volumePanel" },
  ];
  if (withFullscreen) children.push({ name_: "fullscreenToggle" });
  const controlBar = {
    addCalls: 0,
    children: () => children,
    getChild(name: string) {
      return children.find((child) => child.name_ === name);
    },
    addChild(child: string | FakeChild, _options?: unknown, index?: number) {
      this.addCalls += 1;
      const made = typeof child === "string" ? { name_: child } : child;
      children.splice(index ?? children.length, 0, made);
      return made;
    },
  };
  const player = untrusted<ControlBarPlayer>({ controlBar });
  return { player, controlBar };
}

const names = (controlBar: { children(): FakeChild[] }) =>
  controlBar.children().map((child) => child.name_);

const NEW_BUTTONS = ["peekVrButton", "peekAirPlayButton", "peekCastButton"];

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ])
  );
}

describe("addOrderedControl", () => {
  it("names the order VR, AirPlay, Cast, fullscreen", () => {
    expect([...CONTROL_BAR_ORDER]).toEqual([
      "peekVrButton",
      "peekAirPlayButton",
      "peekCastButton",
      "fullscreenToggle",
    ]);
  });

  it.each(permutations(NEW_BUTTONS))(
    "adding %s, %s, %s in that order, the bar reads VR, AirPlay, Cast, fullscreen",
    (...order) => {
      const { player, controlBar } = makePlayer();
      for (const name of order) addOrderedControl(player, name, name);
      expect(names(controlBar)).toEqual([
        "playToggle",
        "volumePanel",
        "peekVrButton",
        "peekAirPlayButton",
        "peekCastButton",
        "fullscreenToggle",
      ]);
    }
  );

  it("a second add of the same name returns the existing control and adds nothing", () => {
    const { player, controlBar } = makePlayer();
    const first = addOrderedControl(player, "peekCastButton", "peekCastButton");
    const calls = controlBar.addCalls;
    const second = addOrderedControl(
      player,
      "peekCastButton",
      "peekCastButton"
    );
    expect(second).toBe(first);
    expect(controlBar.addCalls).toBe(calls);
    expect(
      names(controlBar).filter((n) => n === "peekCastButton")
    ).toHaveLength(1);
  });

  it("without a fullscreen toggle, the controls go at the end, in order", () => {
    const { player, controlBar } = makePlayer(false);
    for (const name of [
      "peekCastButton",
      "peekVrButton",
      "peekAirPlayButton",
    ]) {
      addOrderedControl(player, name, name);
    }
    expect(names(controlBar)).toEqual([
      "playToggle",
      "volumePanel",
      "peekVrButton",
      "peekAirPlayButton",
      "peekCastButton",
    ]);
  });

  it("passes the options to addChild", () => {
    const { player, controlBar } = makePlayer();
    const seen: unknown[] = [];
    const original = controlBar.addChild.bind(controlBar);
    controlBar.addChild = (child, options, index) => {
      seen.push(options);
      return original(child, options, index);
    };
    addOrderedControl(player, "peekVrButton", "peekVrButton", { text: "VR" });
    expect(seen).toEqual([{ text: "VR" }]);
  });

  it("a name outside CONTROL_BAR_ORDER throws", () => {
    const { player, controlBar } = makePlayer();
    expect(() => addOrderedControl(player, "peekCsatButton", "x")).toThrow(
      /peekCsatButton/
    );
    expect(controlBar.addCalls).toBe(0);
  });
});
