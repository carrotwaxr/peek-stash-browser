/**
 * Whether this tab can cast at all: a secure context (Chromecast needs HTTPS)
 * in a Chromium browser. It loads with the Scene page; `useCast` asks it
 * before requesting any cast code, so another browser fetches neither the
 * cast chunks nor Google's script. TV mode is `useCast`'s own check.
 */

/**
 * Chromium by user agent: headless Chromium has no `window.chrome`, so that
 * test would refuse the E2E browser. iOS browsers are WebKit under any name.
 */
function isChromium(userAgent: string): boolean {
  if (/CriOS|EdgiOS|iPhone|iPad|iPod/.test(userAgent)) return false;
  return /(Chrome|Chromium|Edg)\//.test(userAgent);
}

export function canCast(): boolean {
  return window.isSecureContext && isChromium(navigator.userAgent);
}
