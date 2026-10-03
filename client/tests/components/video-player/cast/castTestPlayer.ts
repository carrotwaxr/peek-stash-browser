/**
 * A real video.js player in happy-dom with a source set, so the middleware
 * chain runs as in the browser. happy-dom's <video> plays nothing, so
 * `canPlayType` is stubbed and `play` resolved; the tests spy on the element.
 */
import { untrusted } from "@tests/helpers/untrusted";
import videojs from "video.js";
import { vi } from "vitest";

/** The player as the cast tests drive it */
export interface TestPlayer {
  currentTime(seconds?: number): number;
  duration(): number;
  paused(): boolean;
  ended(): boolean;
  play(): Promise<void> | undefined;
  pause(): void;
  hasStarted(): boolean;
  currentSrc(): string;
  trigger(event: string): void;
  on(event: string, handler: () => void): void;
  ready(callback: () => void): void;
  el(): HTMLElement;
  tech(options: boolean): {
    el(): HTMLVideoElement;
    setSource(source: unknown): void;
    trigger(event: string): void;
  };
  controlBar: {
    getChild(
      name: string
    ): { hasClass(name: string): boolean; controlText(): string } | undefined;
  };
  dispose(): void;
  isDisposed(): boolean;
  peekCastConnected?: boolean;
  peekCastState?: string;
}

export interface TestSource {
  src: string;
  type: string;
  offset?: boolean;
  duration?: number;
}

const DIRECT: TestSource = {
  src: "/api/scene/12/proxy-stream/stream?instanceId=inst-a",
  type: "video/mp4",
};

/** Stubs the media element so a source loads, and returns the spies */
export function stubMediaElement() {
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
  return {
    play: vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve()),
    pause: vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {}),
    seek: vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set"),
  };
}

/** A ready player playing `source` (Direct by default) */
export async function startPlayer(source: TestSource = DIRECT) {
  const wrapper = document.createElement("video-js");
  document.body.appendChild(wrapper);
  const player = untrusted<TestPlayer>(videojs(wrapper, { controls: true }));
  await new Promise<void>((resolve) => player.ready(resolve));
  untrusted<{ src(source: TestSource): void }>(player).src(source);
  // video.js runs the source through the middleware on a 1 ms timer
  await new Promise((resolve) => setTimeout(resolve, 20));
  return player;
}
