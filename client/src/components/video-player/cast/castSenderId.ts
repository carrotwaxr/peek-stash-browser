/**
 * This tab's name as a Cast sender (RC6). Each load sends it as
 * `customData.sender`, and only the tab whose id the playing media carries
 * records its progress, so two tabs on one session never both post.
 *
 * Kept in sessionStorage: a reload of the tab keeps the id (it goes on
 * recording the cast it started) and every other tab has its own. A tab
 * duplicated by the browser copies sessionStorage, and with it the id.
 * Cast runs only in a secure context, where `crypto.randomUUID` exists.
 */
const KEY = "peek.cast.sender";

/** The id when sessionStorage is unavailable: one per page load */
let fallback: string | undefined;

export function castSenderId(): string {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    fallback ??= crypto.randomUUID();
    return fallback;
  }
}
