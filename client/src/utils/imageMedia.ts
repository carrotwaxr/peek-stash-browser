/**
 * Whether an image entry is really a video file. Stash stores short clips
 * (mp4, webm and so on) as images; the image viewer must play them in a
 * <video> element, since an <img> shows nothing for them.
 */

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "webm", "mov"]);

interface VideoImageCandidate {
  filePath?: string | null;
  files?: Array<{ path?: string | null; mime_type?: string | null }> | null;
}

function hasVideoExtension(path: string | null | undefined): boolean {
  if (!path) return false;
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return VIDEO_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function isVideoImage(
  image: VideoImageCandidate | null | undefined
): boolean {
  if (!image) return false;
  const first = image.files?.[0];
  if (first?.mime_type)
    return first.mime_type.toLowerCase().startsWith("video/");
  return hasVideoExtension(image.filePath) || hasVideoExtension(first?.path);
}
