/**
 * Player sources from the server's stream list.
 *
 * The server sends each scene's streams as Peek proxy paths
 * (/api/scene/:id/proxy-stream/...), built from Stash's own choices for the
 * file, with no Stash host and no API key. The player uses them unchanged.
 * Kept free of video.js so it can be unit tested.
 */

export interface PlayerSource {
  src: string;
  type?: string;
  label?: string;
  offset: boolean;
  duration?: number;
}

/** Direct play, HLS and DASH report real times; other transcodes need an offset. */
function needsOffset(src: string): boolean {
  const pathname = src.split("?")[0] ?? src;
  return !(
    pathname.endsWith("/proxy-stream/stream") ||
    pathname.endsWith("/stream.m3u8") ||
    pathname.endsWith("/stream.mpd")
  );
}

export function buildPlayerSources(scene: {
  id: string;
  instanceId?: string | null;
  sceneStreams?: Array<{
    url: string;
    mime_type?: string | null;
    label?: string | null;
  }>;
  files?: Array<{ duration?: number | null }>;
}): PlayerSource[] {
  if (scene.sceneStreams && scene.sceneStreams.length > 0) {
    // Video duration from the first file (HLS transcodes need it to show the
    // right duration)
    const duration = scene.files?.[0]?.duration || undefined;
    return scene.sceneStreams.map((stream) => ({
      src: stream.url,
      type: stream.mime_type || undefined,
      label: stream.label || undefined,
      offset: needsOffset(stream.url),
      duration,
    }));
  }

  console.warn(
    "[VideoPlayer] No sceneStreams available, falling back to the Direct stream"
  );
  const params = new URLSearchParams();
  if (scene.instanceId) params.set("instanceId", scene.instanceId);
  const query = params.toString();
  return [
    {
      src: `/api/scene/${encodeURIComponent(scene.id)}/proxy-stream/stream${query ? `?${query}` : ""}`,
      label: "Direct",
      offset: false,
    },
  ];
}
