import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_PROBE_LIMIT,
  clearMediaProbeCache,
  useMediaFallback,
} from "../../src/hooks/useMediaFallback";

const headAnswering = (contentType: string | null) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(null, {
        status: 200,
        headers: contentType ? { "Content-Type": contentType } : {},
      })
    )
  );

describe("useMediaFallback", () => {
  beforeEach(() => {
    clearMediaProbeCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a failed image whose HEAD says video/* becomes a video", async () => {
    const fetchMock = headAnswering("video/mp4");
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMediaFallback("/api/proxy/tag/1"));
    expect(result.current.isVideo).toBe(false);

    act(() => result.current.onImageError());

    await waitFor(() => expect(result.current.isVideo).toBe(true));
    expect(result.current.hasError).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/proxy/tag/1",
      expect.objectContaining({ method: "HEAD" }),
    ]);
  });

  it("an image that is not a video ends in hasError", async () => {
    vi.stubGlobal("fetch", headAnswering("text/html"));
    const { result } = renderHook(() => useMediaFallback("/broken.png"));

    act(() => result.current.onImageError());

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.isVideo).toBe(false);
  });

  it("a second card with the same src does not probe again", async () => {
    const fetchMock = headAnswering("video/webm");
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useMediaFallback("/shared.webm"));
    act(() => first.result.current.onImageError());
    await waitFor(() => expect(first.result.current.isVideo).toBe(true));

    const second = renderHook(() => useMediaFallback("/shared.webm"));
    act(() => second.result.current.onImageError());

    await waitFor(() => expect(second.result.current.isVideo).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a src change aborts the pending probe and its answer is ignored", async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Array<(res: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_src: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Promise<Response>((resolve) => resolvers.push(resolve));
      })
    );
    const { result, rerender } = renderHook(
      ({ src }) => useMediaFallback(src),
      { initialProps: { src: "/a.mp4" } }
    );
    act(() => result.current.onImageError());
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    rerender({ src: "/b.png" });
    expect(signals[0]?.aborted).toBe(true);

    // The old probe answers late: nothing changes for the new src
    await act(async () => {
      resolvers[0]?.(
        new Response(null, { headers: { "Content-Type": "video/mp4" } })
      );
      await Promise.resolve();
    });
    expect(result.current.isVideo).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it("unmounting aborts the pending probe", () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_src: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return new Promise<Response>(() => {});
      })
    );
    const { result, unmount } = renderHook(() => useMediaFallback("/a.mp4"));
    act(() => result.current.onImageError());

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  describe("cards asking about one src at the same time", () => {
    const pendingHead = () => {
      const signals: AbortSignal[] = [];
      const resolvers: Array<(res: Response) => void> = [];
      const fetchMock = vi.fn((_src: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Promise<Response>((resolve) => resolvers.push(resolve));
      });
      vi.stubGlobal("fetch", fetchMock);
      return { signals, resolvers, fetchMock };
    };

    it("send one HEAD and both end as a video", async () => {
      const { resolvers, fetchMock } = pendingHead();
      const a = renderHook(() => useMediaFallback("/cover.mp4"));
      const b = renderHook(() => useMediaFallback("/cover.mp4"));
      act(() => a.result.current.onImageError());
      act(() => b.result.current.onImageError());
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolvers[0]?.(
          new Response(null, { headers: { "Content-Type": "video/mp4" } })
        );
        await Promise.resolve();
      });

      await waitFor(() => expect(a.result.current.isVideo).toBe(true));
      expect(b.result.current.isVideo).toBe(true);
    });

    it("keep the probe alive while one of them is mounted", async () => {
      const { signals, resolvers } = pendingHead();
      const a = renderHook(() => useMediaFallback("/cover.mp4"));
      const b = renderHook(() => useMediaFallback("/cover.mp4"));
      act(() => a.result.current.onImageError());
      act(() => b.result.current.onImageError());

      a.unmount();
      expect(signals[0]?.aborted).toBe(false);

      await act(async () => {
        resolvers[0]?.(
          new Response(null, { headers: { "Content-Type": "video/mp4" } })
        );
        await Promise.resolve();
      });
      await waitFor(() => expect(b.result.current.isVideo).toBe(true));
    });

    it("abort the probe when both are gone, and a later card probes anew", () => {
      const { signals, fetchMock } = pendingHead();
      const a = renderHook(() => useMediaFallback("/cover.mp4"));
      const b = renderHook(() => useMediaFallback("/cover.mp4"));
      act(() => a.result.current.onImageError());
      act(() => b.result.current.onImageError());

      a.unmount();
      b.unmount();
      expect(signals[0]?.aborted).toBe(true);

      const c = renderHook(() => useMediaFallback("/cover.mp4"));
      act(() => c.result.current.onImageError());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(signals[1]?.aborted).toBe(false);
    });
  });

  it("a network error ends in hasError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    const { result } = renderHook(() => useMediaFallback("/offline.png"));

    act(() => result.current.onImageError());

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.isVideo).toBe(false);
  });

  it("a network error is not remembered", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(null, { headers: { "Content-Type": "video/mp4" } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useMediaFallback("/flaky.mp4"));
    act(() => first.result.current.onImageError());
    await waitFor(() => expect(first.result.current.hasError).toBe(true));

    const second = renderHook(() => useMediaFallback("/flaky.mp4"));
    act(() => second.result.current.onImageError());

    await waitFor(() => expect(second.result.current.isVideo).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a missing src is an error without a probe", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMediaFallback(undefined));

    act(() => result.current.onImageError());

    expect(result.current.hasError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a video that fails to play ends in hasError", async () => {
    vi.stubGlobal("fetch", headAnswering("video/mp4"));
    const { result } = renderHook(() => useMediaFallback("/bad.mp4"));
    act(() => result.current.onImageError());
    await waitFor(() => expect(result.current.isVideo).toBe(true));

    act(() => result.current.onVideoError());

    expect(result.current.hasError).toBe(true);
  });

  it("a new src starts over", async () => {
    vi.stubGlobal("fetch", headAnswering("video/mp4"));
    const { result, rerender } = renderHook(
      ({ src }) => useMediaFallback(src),
      { initialProps: { src: "/a.mp4" } }
    );
    act(() => result.current.onImageError());
    await waitFor(() => expect(result.current.isVideo).toBe(true));

    rerender({ src: "/b.png" });

    expect(result.current.isVideo).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it("keeps at most the limit of answers, the oldest leaving first", async () => {
    const fetchMock = headAnswering("video/mp4");
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ src }) => useMediaFallback(src),
      { initialProps: { src: "/img/0" } }
    );
    for (let i = 0; i <= MEDIA_PROBE_LIMIT; i++) {
      rerender({ src: `/img/${i}` });
      await act(async () => {
        result.current.onImageError();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.isVideo).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(MEDIA_PROBE_LIMIT + 1);

    // The first src was dropped: it probes again
    const again = renderHook(() => useMediaFallback("/img/0"));
    act(() => again.result.current.onImageError());
    await waitFor(() => expect(again.result.current.isVideo).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(MEDIA_PROBE_LIMIT + 2);
  });
});
