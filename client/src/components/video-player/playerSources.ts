/**
 * Player sources from the server's stream list.
 *
 * The server sends each scene's streams as Peek proxy paths
 * (/api/scene/:id/proxy-stream/...), built from Stash's own choices for the
 * file, with no Stash host and no API key. The player uses them unchanged,
 * in Stash's order unless this browser cannot decode the file. Kept free of
 * video.js so it can be unit tested.
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

/** The file's codecs, as `canDecode` (`utils/browserPlayback.ts`) reads them */
export interface DecodableFile {
  video_codec?: string | null;
  audio_codec?: string | null;
}

/** Can this browser decode the file? Null when it cannot tell */
export type DecodeCheck = (file: DecodableFile) => boolean | null;

/**
 * Stash's Direct stream or its MKV remux: the file's own video, which plays
 * only where the browser decodes its codec. Transcodes are everything else.
 */
export function isDirectSource(src: string): boolean {
  const pathname = new URL(src, "http://peek.invalid").pathname;
  return (
    pathname.endsWith("/proxy-stream/stream") ||
    pathname.endsWith("/proxy-stream/stream.mkv")
  );
}

/**
 * The player's sources, in the order it tries them: Stash's, except that for
 * a file this browser cannot decode (`canDecode` false) Direct and MKV go
 * after the transcodes. Nothing is dropped, so the source menu still offers
 * them.
 */
export function buildPlayerSources(
  scene: {
    id: string;
    instanceId: string;
    sceneStreams?: Array<{
      url: string;
      mime_type?: string | null;
      label?: string | null;
    }>;
    files?: Array<DecodableFile & { duration?: number | null }>;
  },
  canDecode: DecodeCheck
): PlayerSource[] {
  if (scene.sceneStreams && scene.sceneStreams.length > 0) {
    // Video duration from the first file (HLS transcodes need it to show the
    // right duration)
    const firstFile = scene.files?.[0];
    const duration = firstFile?.duration || undefined;
    const sources = scene.sceneStreams.map((stream) => ({
      src: stream.url,
      type: stream.mime_type || undefined,
      label: stream.label || undefined,
      offset: needsOffset(stream.url),
      duration,
    }));
    if (!firstFile || canDecode(firstFile) !== false) return sources;
    return [
      ...sources.filter((source) => !isDirectSource(source.src)),
      ...sources.filter((source) => isDirectSource(source.src)),
    ];
  }

  console.warn(
    "[VideoPlayer] No sceneStreams available, falling back to the Direct stream"
  );
  const params = new URLSearchParams({ instanceId: scene.instanceId });
  return [
    {
      src: `/api/scene/${encodeURIComponent(scene.id)}/proxy-stream/stream?${params.toString()}`,
      label: "Direct",
      offset: false,
    },
  ];
}
