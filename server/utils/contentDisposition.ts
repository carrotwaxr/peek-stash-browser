/**
 * Longest name `safeFileName` returns, in UTF-8 bytes. File systems allow 255
 * per name; callers add an extension and `uniqueFileName` a " (n)".
 */
const MAX_NAME_BYTES = 200;

/** Names Windows keeps for devices, alone or before any extension. */
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** The longest start of `text` that fits in `maxBytes` of UTF-8, whole characters only. */
function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    bytes += Buffer.byteLength(char);
    if (bytes > maxBytes) break;
    end += char.length;
  }
  return text.slice(0, end);
}

/**
 * Capped, with no dots or spaces at either end: Windows drops trailing ones,
 * and a leading dot hides a file on Unix.
 */
function fitName(name: string): string {
  return truncateUtf8(name, MAX_NAME_BYTES).replace(/^[\s.]+|[\s.]+$/gu, "");
}

/**
 * A file or folder name that means the same on every OS: control characters
 * dropped, reserved characters "_", no dots or spaces at either end (so never
 * "." or ".."), a Windows device name prefixed with "_", at most 200 bytes.
 * Nothing left becomes "download".
 */
export function safeFileName(name: string): string {
  let safe = fitName(
    name.replace(/\p{Cc}/gu, "").replace(/[<>:"/\\|?*]/g, "_")
  );
  if (safe === "") return "download";
  const stem = safe.slice(0, (safe + ".").indexOf(".")).trimEnd();
  if (WINDOWS_DEVICE_NAME.test(stem)) safe = fitName(`_${safe}`);
  return safe;
}

/**
 * `name`, or the first of `name (2)`, `name (3)`, ... that `taken` does not
 * hold yet, compared the way Windows and macOS compare names (case and
 * Unicode normalisation ignored). `taken` holds those comparison keys; the
 * result's key is added to it.
 */
export function uniqueFileName(name: string, taken: Set<string>): string {
  const key = (candidate: string) => candidate.normalize("NFC").toLowerCase();
  let candidate = name;
  for (let n = 2; taken.has(key(candidate)); n++) {
    candidate = `${name} (${n})`;
  }
  taken.add(key(candidate));
  return candidate;
}

/**
 * RFC 6266 attachment header: an ASCII `filename` for old clients plus
 * `filename*` (RFC 8187) carrying the exact UTF-8 name. Node rejects header
 * bytes above 0xFF, so raw user text must never reach Content-Disposition.
 */
export function attachmentContentDisposition(fileName: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = fileName.replace(/[\u0000-\u001f\u007f]/g, "");
  const ascii =
    cleaned
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // é -> e
      .replace(/[^\x20-\x7e]/gu, "_") // one _ per code point, emoji included
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const encoded = encodeURIComponent(cleaned || "download").replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
