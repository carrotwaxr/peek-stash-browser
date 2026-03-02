/**
 * Utility functions for working with video sprite sheets and VTT files
 */

/**
 * Parse a WebVTT file for sprite sheet thumbnails
 * VTT format example:
 * WEBVTT
 *
 * 00:00:00.000 --> 00:00:10.000
 * sprite#xywh=0,0,160,90
 *
 * @param {string} vttContent - The raw VTT file content
 * @returns {Array<Object>} Array of cue objects with timing and sprite position
 */
function parseVTT(vttContent) {
  const cues = [];
  const lines = vttContent.split("\n");

  let i = 0;
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes("-->")) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp lines (format: 00:00:00.000 --> 00:00:10.000)
    if (line.includes("-->")) {
      const [startTime, endTime] = line.split("-->").map((t) => t.trim());

      // Next line should have the sprite position
      i++;
      if (i < lines.length) {
        const positionLine = lines[i].trim();

        // Parse sprite position (format: sprite#xywh=x,y,width,height)
        const match = positionLine.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);
        if (match) {
          cues.push({
            startTime: parseTimestamp(startTime),
            endTime: parseTimestamp(endTime),
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            width: parseInt(match[3]),
            height: parseInt(match[4]),
          });
        }
      }
    }
    i++;
  }

  return cues;
}

/**
 * Convert VTT timestamp to seconds
 * Format: HH:MM:SS.mmm or MM:SS.mmm
 * @param {string} timestamp - VTT timestamp string
 * @returns {number} Time in seconds
 */
function parseTimestamp(timestamp) {
  const parts = timestamp.split(":");
  let hours = 0,
    minutes = 0,
    seconds = 0;

  if (parts.length === 3) {
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[1]);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0]);
    seconds = parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Extract sprite position from a cue object
 * @param {Object} cue - VTT cue object
 * @returns {Object} Sprite position { x, y, width, height }
 */
function extractSpritePosition(cue) {
  return {
    x: cue.x,
    y: cue.y,
    width: cue.width,
    height: cue.height,
  };
}

/**
 * Fetch and parse a VTT file from a URL
 * @param {string} vttUrl - URL to the VTT file
 * @returns {Promise<Array<Object>>} Promise resolving to parsed cues
 */
export async function fetchAndParseVTT(vttUrl) {
  try {
    const response = await fetch(vttUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch VTT: ${response.statusText}`);
    }
    const vttContent = await response.text();
    return parseVTT(vttContent);
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
export function getEvenlySpacedSprites(cues, count = 5) {
  if (!cues || cues.length === 0) return [];

  if (cues.length <= count) {
    return cues.map(extractSpritePosition);
  }

  const step = Math.floor(cues.length / count);
  const sprites = [];

  for (let i = 0; i < count; i++) {
    const index = Math.min(i * step, cues.length - 1);
    sprites.push(extractSpritePosition(cues[index]));
  }

  return sprites;
}
