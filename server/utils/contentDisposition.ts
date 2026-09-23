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
