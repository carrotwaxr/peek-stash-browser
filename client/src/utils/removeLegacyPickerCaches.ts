/**
 * The filter pickers used to cache their first page of options in
 * localStorage ("peek-performers-cache", "peek-tags_scenes-cache", ...).
 * They now search in SQL and read nothing from there, so start-up drops
 * whatever an earlier version left in the browser.
 */
const LEGACY_PICKER_CACHE_KEY =
  /^peek-(performers|studios|tags|groups|galleries)(_.+)?-cache$/;

export function removeLegacyPickerCaches(storage: Storage = localStorage) {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && LEGACY_PICKER_CACHE_KEY.test(key)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
}
