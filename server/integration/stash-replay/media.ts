/**
 * The Stash media routes the replay serves (sweep item 83), from the
 * generated test-pattern files in samples/ (see the design's ffmpeg
 * commands). Every route Peek proxies is here; an id the library lacks
 * answers 404, as Stash does, and a path that is no route answers undefined
 * so the server can record it as unsupported.
 *
 * Files honour a single Range (206 with Content-Range, 416 when it starts
 * past the end). Query parameters such as t, default and resolution are
 * ignored, except that an HLS playlist carries resolution on to its segment.
 */
import { readFileSync } from "fs";
import {
  type Entity,
  type EntityType,
  type ReplayLibrary,
  isRecord,
} from "./library.js";

export interface MediaResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

type Sample =
  | "sample.jpg"
  | "sample.webp"
  | "sprite.jpg"
  | "sample.webm"
  | "sample.mpegts";

const SAMPLES_DIR = new URL("./samples/", import.meta.url);
const loaded = new Map<Sample, Buffer>();

function sample(name: Sample): Buffer {
  let data = loaded.get(name);
  if (data === undefined) {
    data = readFileSync(new URL(name, SAMPLES_DIR));
    loaded.set(name, data);
  }
  return data;
}

/** Sprite tiles, as sprite.jpg holds them: 4x4 tiles of 128x72. */
const SPRITE_COLUMNS = 4;
const SPRITE_TILES = 16;
const TILE_WIDTH = 128;
const TILE_HEIGHT = 72;

const NOT_FOUND: MediaResponse = {
  status: 404,
  headers: { "Content-Type": "text/plain" },
  body: "not found",
};

function text(body: string, contentType: string): MediaResponse {
  return { status: 200, headers: { "Content-Type": contentType }, body };
}

/**
 * The byte range a Range header asks for, "unsatisfiable", or undefined
 * when there is none or it is not a single valid byte range (a server may
 * then ignore it and send the whole file).
 */
function byteRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | "unsatisfiable" | undefined {
  const match =
    header === undefined ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return undefined;
  const [, first = "", last = ""] = match;
  if (first === "") {
    if (last === "") return undefined;
    const suffix = Number(last);
    return suffix === 0
      ? "unsatisfiable"
      : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (last !== "" && Number(last) < start) return undefined;
  if (start >= size) return "unsatisfiable";
  return {
    start,
    end: last === "" ? size - 1 : Math.min(Number(last), size - 1),
  };
}

interface RouteContext {
  /** The entity the route's first id names (the scene, for marker routes). */
  entity: Entity;
  search: URLSearchParams;
  range: string | undefined;
}

function file(name: Sample, contentType: string) {
  return ({ range }: RouteContext): MediaResponse => {
    const data = sample(name);
    const headers = { "Content-Type": contentType, "Accept-Ranges": "bytes" };
    const wanted = byteRange(range, data.length);
    if (wanted === "unsatisfiable") {
      return {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${data.length}` },
        body: "",
      };
    }
    if (wanted === undefined) {
      return { status: 200, headers, body: data };
    }
    return {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${wanted.start}-${wanted.end}/${data.length}`,
      },
      body: data.subarray(wanted.start, wanted.end + 1),
    };
  };
}

/** A one-segment VOD playlist in the shape Stash writes. */
function hlsPlaylist({ entity, search }: RouteContext): MediaResponse {
  const resolution = search.get("resolution");
  const query =
    resolution === null ? "" : `?resolution=${encodeURIComponent(resolution)}`;
  return text(
    [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:2",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXTINF:2.000,",
      `/scene/${entity.id}/stream.m3u8/0.ts${query}`,
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
    "application/vnd.apple.mpegurl"
  );
}

function vttTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** The scene's first file, where Stash reads duration and hashes from. */
function firstFile(scene: Entity): Record<string, unknown> | undefined {
  const files = scene.files;
  const first: unknown = Array.isArray(files) ? files[0] : undefined;
  return isRecord(first) ? first : undefined;
}

/** 16 cues over the scene's duration, one per sprite tile, as Stash writes. */
function thumbsVtt({ entity }: RouteContext): MediaResponse {
  const first = firstFile(entity);
  const duration = first?.duration;
  const fingerprints: unknown = first?.fingerprints;
  const oshash: unknown = Array.isArray(fingerprints)
    ? fingerprints.find(
        (fingerprint: unknown) =>
          isRecord(fingerprint) && fingerprint.type === "oshash"
      )
    : undefined;
  // Stash has no sprite for a scene without a file
  if (
    typeof duration !== "number" ||
    duration <= 0 ||
    !isRecord(oshash) ||
    typeof oshash.value !== "string"
  ) {
    return NOT_FOUND;
  }
  const step = duration / SPRITE_TILES;
  const cues = Array.from({ length: SPRITE_TILES }, (_, tile) => {
    const x = (tile % SPRITE_COLUMNS) * TILE_WIDTH;
    const y = Math.floor(tile / SPRITE_COLUMNS) * TILE_HEIGHT;
    return `${vttTime(tile * step)} --> ${vttTime((tile + 1) * step)}\n${String(oshash.value)}_sprite.jpg#xywh=${x},${y},${TILE_WIDTH},${TILE_HEIGHT}\n`;
  });
  return text(["WEBVTT", "", ...cues].join("\n"), "text/vtt");
}

/** A two-cue caption for a scene that has captions; 404 otherwise. */
function caption({ entity }: RouteContext): MediaResponse {
  const captions = entity.captions;
  if (!Array.isArray(captions) || captions.length === 0) {
    return NOT_FOUND;
  }
  return text(
    [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:01.000",
      `Scene ${entity.id} caption one`,
      "",
      "00:00:01.000 --> 00:00:02.000",
      `Scene ${entity.id} caption two`,
      "",
    ].join("\n"),
    "text/vtt"
  );
}

interface Route {
  pattern: RegExp;
  /** The entity type of each id the pattern captures; each must exist. */
  types: EntityType[];
  serve: (context: RouteContext) => MediaResponse;
}

const jpeg = file("sample.jpg", "image/jpeg");
const webm = file("sample.webm", "video/webm");

const ROUTES: Route[] = [
  { pattern: /^\/scene\/(\d+)\/screenshot$/, types: ["scene"], serve: jpeg },
  { pattern: /^\/performer\/(\d+)\/image$/, types: ["performer"], serve: jpeg },
  { pattern: /^\/studio\/(\d+)\/image$/, types: ["studio"], serve: jpeg },
  { pattern: /^\/tag\/(\d+)\/image$/, types: ["tag"], serve: jpeg },
  {
    pattern: /^\/group\/(\d+)\/(?:frontimage|backimage)$/,
    types: ["group"],
    serve: jpeg,
  },
  { pattern: /^\/gallery\/(\d+)\/cover$/, types: ["gallery"], serve: jpeg },
  {
    pattern: /^\/image\/(\d+)\/(?:thumbnail|preview|image)$/,
    types: ["image"],
    serve: jpeg,
  },
  {
    pattern: /^\/scene\/(\d+)\/scene_marker\/(\d+)\/screenshot$/,
    types: ["scene", "clip"],
    serve: jpeg,
  },
  {
    pattern: /^\/scene\/(\d+)\/webp$/,
    types: ["scene"],
    serve: file("sample.webp", "image/webp"),
  },
  { pattern: /^\/scene\/(\d+)\/preview$/, types: ["scene"], serve: webm },
  {
    pattern: /^\/scene\/(\d+)\/scene_marker\/(\d+)\/(?:preview|stream)$/,
    types: ["scene", "clip"],
    serve: webm,
  },
  // The synthetic files are WebM, so every direct stream is too
  {
    pattern: /^\/scene\/(\d+)\/stream(?:\.mp4|\.webm|\.mkv)?$/,
    types: ["scene"],
    serve: webm,
  },
  {
    pattern: /^\/scene\/(\d+)\/stream\.m3u8$/,
    types: ["scene"],
    serve: hlsPlaylist,
  },
  {
    pattern: /^\/scene\/(\d+)\/stream\.m3u8\/\d+\.ts$/,
    types: ["scene"],
    serve: file("sample.mpegts", "video/MP2T"),
  },
  {
    pattern: /^\/scene\/(\d+)\/vtt\/sprite$/,
    types: ["scene"],
    serve: file("sprite.jpg", "image/jpeg"),
  },
  {
    pattern: /^\/scene\/(\d+)\/vtt\/thumbs$/,
    types: ["scene"],
    serve: thumbsVtt,
  },
  { pattern: /^\/scene\/(\d+)\/caption$/, types: ["scene"], serve: caption },
];

/**
 * The answer to GET `pathname`, or undefined when it is not a Stash media
 * route the replay serves.
 */
export function answerMedia(
  lib: ReplayLibrary,
  pathname: string,
  search: URLSearchParams,
  range: string | undefined
): MediaResponse | undefined {
  for (const route of ROUTES) {
    const match = route.pattern.exec(pathname);
    if (match === null) continue;
    const found = route.types.map((type, index) =>
      lib.entities[type].find((entity) => entity.id === match[index + 1])
    );
    const [entity] = found;
    if (entity === undefined || found.includes(undefined)) {
      return NOT_FOUND;
    }
    return route.serve({ entity, search, range });
  }
  return undefined;
}

/** A path as recorded when unsupported: ids as :id, no query string. */
export function pathShape(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) ? ":id" : segment))
    .join("/");
}
