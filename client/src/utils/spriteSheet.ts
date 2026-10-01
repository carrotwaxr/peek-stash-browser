/**
 * Utility functions for working with video sprite sheets and VTT files
 */

/**
 * One cue of a sprite VTT: Stash's seek-thumbnail files, where each cue's text
 * is `<sprite image>#xywh=x,y,width,height`.
 */
export interface SpriteCue {
  startTime: number;
  endTime: number;
  /** The sprite image the cue names; empty when the cue names none */
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpritePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TIMING = /^([\d:.]+)\s*-->\s*([\d:.]+)/;
const SPRITE_POSITION = /^(.*?)#xywh=(\d+),(\d+),(\d+),(\d+)\s*$/i;

/**
 * Parse a sprite VTT, the one parser for the cards' previews and the player's
 * seek thumbnails. Takes LF, CRLF or CR line ends, a byte-order mark, cue ids,
 * NOTE blocks, cue settings and hour or minute timestamps; a cue whose text is
 * not a sprite position is skipped.
 */
export function parseSpriteVtt(text: string): SpriteCue[] {
  const cues: SpriteCue[] = [];
  const blocks = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .join("\n")
    .split(/\n[ \t]*\n/);

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;

    const timing = TIMING.exec(lines[timingIndex] ?? "");
    const position = SPRITE_POSITION.exec(
      lines.slice(timingIndex + 1).find((line) => line !== "") ?? ""
    );
    if (!timing || !position) continue;
    const [, start = "", end = ""] = timing;
    const [, image = "", x = "", y = "", width = "", height = ""] = position;

    const startTime = parseTimestamp(start);
    const endTime = parseTimestamp(end);
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) continue;

    cues.push({
      startTime,
      endTime,
      image,
      x: parseInt(x, 10),
      y: parseInt(y, 10),
      width: parseInt(width, 10),
      height: parseInt(height, 10),
    });
  }

  return cues;
}

/**
 * Convert a VTT timestamp (`HH:MM:SS.mmm` or `MM:SS.mmm`) to seconds; NaN for
 * anything else
 */
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":");
  if (parts.length < 2 || parts.length > 3) return NaN;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * Fetch and parse a sprite VTT. Rejects on an error status, and with an
 * `AbortError` once `signal` aborts.
 */
export async function fetchSpriteVtt(
  url: string,
  signal?: AbortSignal
): Promise<SpriteCue[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch VTT: ${response.status} ${response.statusText}`
    );
  }
  return parseSpriteVtt(await response.text());
}

/**
 * Extract sprite position from a cue object
 * @param {Object} cue - VTT cue object
 * @returns {Object} Sprite position { x, y, width, height }
 */
function extractSpritePosition(cue: SpriteCue): SpritePosition {
  return {
    x: cue.x,
    y: cue.y,
    width: cue.width,
    height: cue.height,
  };
}

/**
 * Fetch and parse a sprite VTT for a card preview: an empty list when it
 * cannot be loaded
 */
export async function fetchAndParseVTT(vttUrl: string): Promise<SpriteCue[]> {
  try {
    return await fetchSpriteVtt(vttUrl);
  } catch (error) {
    console.error("Error fetching VTT file:", error);
    return [];
  }
}

/**
 * Get evenly spaced sprite positions for cycling through as a preview
 * @param {Array<Object>} cues - Parsed VTT cues
 * @param {number} count - Number of sprites to return
 * @returns {Array<Object>} Array of sprite positions
 */
export function getEvenlySpacedSprites(
  cues: SpriteCue[],
  count = 5
): SpritePosition[] {
  if (!cues || cues.length === 0) return [];

  if (cues.length <= count) {
    return cues.map(extractSpritePosition);
  }

  const step = Math.floor(cues.length / count);
  const sprites = [];

  for (let i = 0; i < count; i++) {
    const index = Math.min(i * step, cues.length - 1);
    const cue = cues[index];
    if (cue) sprites.push(extractSpritePosition(cue));
  }

  return sprites;
}
