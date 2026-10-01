/**
 * MIME type of a scene's original file, from its extension.
 *
 * The direct stream serves the file as stored, so its extension names the
 * container. An external player on Android picks its handler by this type.
 * An unknown extension, or no path, gives `video/*`, which still matches any
 * video handler.
 */
const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  webm: "video/webm",
  wmv: "video/x-ms-wmv",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  flv: "video/x-flv",
  ts: "video/mp2t",
};

const ANY_VIDEO = "video/*";

export function videoMimeType(path: string | null): string {
  if (!path) return ANY_VIDEO;
  const name = path.slice(
    Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1
  );
  const dot = name.lastIndexOf(".");
  if (dot < 0) return ANY_VIDEO;
  return VIDEO_MIME_TYPES[name.slice(dot + 1).toLowerCase()] ?? ANY_VIDEO;
}
