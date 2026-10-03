/**
 * Safari's AirPlay button is its own chunk: `startAirPlay` requests it only
 * where the browser has Safari's AirPlay API, so every other browser never
 * fetches it. A player torn down before the chunk arrives gets no button.
 */
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AirPlayPlayer,
  setupAirPlay,
} from "@/components/video-player/plugins/airplay";
import {
  airPlayChunk,
  startAirPlay,
} from "@/components/video-player/plugins/loadAirPlay";

vi.mock("@/components/video-player/plugins/airplay", () => ({
  setupAirPlay: vi.fn(),
}));

const proto = HTMLVideoElement.prototype as unknown as Record<string, unknown>;
const player = untrusted<AirPlayPlayer>({});

/** The browser as Safari: its media elements can show the AirPlay picker */
const asSafari = () => {
  proto.webkitShowPlaybackTargetPicker = vi.fn();
};

describe("startAirPlay", () => {
  afterEach(() => {
    delete proto.webkitShowPlaybackTargetPicker;
    vi.restoreAllMocks();
    vi.mocked(setupAirPlay).mockReset();
  });

  it("outside Safari the AirPlay chunk is never requested", () => {
    const load = vi.spyOn(airPlayChunk, "load");

    const stop = startAirPlay(player);
    stop();

    expect(load).not.toHaveBeenCalled();
    expect(setupAirPlay).not.toHaveBeenCalled();
  });

  it("in Safari it loads the chunk and sets the button up; the teardown stops it", async () => {
    asSafari();
    const teardown = vi.fn();
    vi.mocked(setupAirPlay).mockReturnValue(teardown);
    const load = vi.spyOn(airPlayChunk, "load");

    const stop = startAirPlay(player);

    await vi.waitFor(() => expect(setupAirPlay).toHaveBeenCalledWith(player));
    expect(load).toHaveBeenCalledTimes(1);
    expect(teardown).not.toHaveBeenCalled();
    stop();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("a player torn down before the chunk arrives never gets the button", async () => {
    asSafari();
    const load = vi.spyOn(airPlayChunk, "load");

    const stop = startAirPlay(player);
    stop();
    await must(load.mock.results[0], "the chunk request").value;
    await Promise.resolve();

    expect(setupAirPlay).not.toHaveBeenCalled();
  });
});
