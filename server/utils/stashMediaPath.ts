/**
 * Allowlists for the media routes Peek proxies to Stash (sweep item 2).
 *
 * The media proxy and the stream proxy used to forward almost any path to
 * Stash with the server's API key attached, which turned them into an
 * anonymous GraphQL client. Now every upstream path is rebuilt from a fixed
 * shape: Stash's media routes for the eight entity types, keyed by numeric
 * id, and its stream files. The regexes admit only digits and fixed words,
 * so no decoded or encoded `..` can pass, and the query is rebuilt from an
 * allowlist of keys rather than forwarded.
 */

export type MediaEntityType =
  | "scene"
  | "clip"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image";

export interface MediaEntity {
  entityType: MediaEntityType;
  entityId: string;
}

export interface StashMediaTarget {
  /** The allowlisted Stash pathname, as given. */
  pathname: string;
  /** Only `t` (digits) and `default` (true|false) survive. */
  search: URLSearchParams;
  /** Every entity the path names, in path order (scene then clip for marker media). */
  entities: MediaEntity[];
}

export const SCENE_ID_PATTERN = /^\d+$/;
export const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Stash's media routes (routes_scene.go, routes_image.go, routes_performer.go,
 * routes_studio.go, routes_tag.go, routes_group.go, routes_gallery.go).
 * Sprite and VTT use the id-keyed form; the hash-keyed paths Stash reports
 * (`/scene/<hash>_sprite.jpg`) cannot be checked against an entity.
 */
const MEDIA_ROUTES: ReadonlyArray<{ re: RegExp; types: MediaEntityType[] }> = [
  {
    re: /^\/scene\/(\d+)\/(?:screenshot|preview|webp|vtt\/thumbs|vtt\/sprite|vtt\/chapter)$/,
    types: ["scene"],
  },
  {
    re: /^\/scene\/(\d+)\/scene_marker\/(\d+)\/(?:screenshot|preview|stream)$/,
    types: ["scene", "clip"],
  },
  { re: /^\/performer\/(\d+)\/image$/, types: ["performer"] },
  { re: /^\/studio\/(\d+)\/image$/, types: ["studio"] },
  { re: /^\/tag\/(\d+)\/image$/, types: ["tag"] },
  { re: /^\/group\/(\d+)\/(?:frontimage|backimage)$/, types: ["group"] },
  { re: /^\/gallery\/(\d+)\/cover$/, types: ["gallery"] },
  { re: /^\/image\/(\d+)\/(?:thumbnail|preview|image)$/, types: ["image"] },
];

const T_PATTERN = /^\d{1,13}$/;
const DEFAULT_PATTERN = /^(?:true|false)$/;

/**
 * Bytes at or below 0x20 (controls and space), DEL, backslash, fragment and
 * percent. The query parser decoded the value once already, so a leftover
 * `%` means double encoding, which Stash's router might decode again.
 */
// eslint-disable-next-line no-control-regex -- control bytes are the point
const FORBIDDEN_CHARS = /[\u0000- \u007f\\#%]/;

/**
 * Parse a `?path=` value from the media proxy. Returns null unless the path
 * is one of Stash's media routes for a numeric id.
 */
export function parseStashMediaPath(raw: string): StashMediaTarget | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  if (FORBIDDEN_CHARS.test(raw)) {
    return null;
  }

  const queryIndex = raw.indexOf("?");
  const pathname = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : raw.slice(queryIndex + 1);

  for (const route of MEDIA_ROUTES) {
    const match = route.re.exec(pathname);
    if (!match) continue;

    const entities = route.types.map((entityType, i) => ({
      entityType,
      entityId: match[i + 1] as string,
    }));

    const given = new URLSearchParams(rawQuery);
    const search = new URLSearchParams();
    const t = given.get("t");
    if (t !== null && T_PATTERN.test(t)) search.set("t", t);
    const dflt = given.get("default");
    if (dflt !== null && DEFAULT_PATTERN.test(dflt)) {
      search.set("default", dflt);
    }

    return { pathname, search, entities };
  }

  return null;
}

/** Stash's stream files under /scene/:id/ (routes_scene.go). */
const STREAM_FILES: ReadonlySet<string> = new Set([
  "stream",
  "stream.mp4",
  "stream.webm",
  "stream.mkv",
  "stream.m3u8",
  "stream.mpd",
]);

/** HLS segments: `stream.m3u8/{n}.ts`. DASH segments are out of scope. */
const HLS_SEGMENT_PATTERN = /^\d{1,6}\.ts$/;

/**
 * True for a stream file Stash serves, plus an HLS segment under
 * `stream.m3u8` only.
 */
export function isAllowedStreamPath(
  streamPath: string,
  subPath?: string
): boolean {
  if (!STREAM_FILES.has(streamPath)) return false;
  if (subPath === undefined) return true;
  return streamPath === "stream.m3u8" && HLS_SEGMENT_PATTERN.test(subPath);
}

const STREAM_RESOLUTIONS: ReadonlySet<string> = new Set([
  "ORIGINAL",
  "FOUR_K",
  "FULL_HD",
  "STANDARD_HD",
  "STANDARD",
  "LOW",
]);
const START_PATTERN = /^\d+(\.\d+)?$/;

/**
 * The query Stash gets for a stream request: `resolution` from Stash's own
 * set and a numeric `start`. Peek's routing keys (`instanceId`) and the
 * signed-link claims (`uid`, `exp`, `sig`) never travel upstream.
 */
export function pickStreamQuery(query: URLSearchParams): URLSearchParams {
  const picked = new URLSearchParams();
  const resolution = query.get("resolution");
  if (resolution !== null && STREAM_RESOLUTIONS.has(resolution)) {
    picked.set("resolution", resolution);
  }
  const start = query.get("start");
  if (start !== null && START_PATTERN.test(start)) {
    picked.set("start", start);
  }
  return picked;
}

const CAPTION_LANG_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

/** A short language code and one of Stash's two caption types. */
export function isAllowedCaption(lang: string, type: string): boolean {
  return CAPTION_LANG_PATTERN.test(lang) && (type === "srt" || type === "vtt");
}
