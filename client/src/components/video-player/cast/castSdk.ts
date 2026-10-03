/**
 * Loader for Google's Cast sender framework.
 *
 * The script is fetched only where Cast can work: a secure context (Chromecast
 * needs HTTPS) in a Chromium browser. Anywhere else the loader resolves null
 * without adding a script, so such a tab never contacts Google. TV mode is the
 * caller's check (`useCast`), not the loader's.
 */

export type CastFramework = typeof cast.framework;

const CAST_SENDER_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const LOAD_TIMEOUT_MS = 10_000;

/** Only a real script load is memoised, never a refusal. */
let loading: Promise<CastFramework | null> | null = null;

/**
 * Chromium by user agent: headless Chromium has no `window.chrome`, so that
 * test would refuse the E2E browser. iOS browsers are WebKit under any name.
 */
function isChromium(userAgent: string): boolean {
  if (/CriOS|EdgiOS|iPhone|iPad|iPod/.test(userAgent)) return false;
  return /(Chrome|Chromium|Edg)\//.test(userAgent);
}

export function loadCastSdk(): Promise<CastFramework | null> {
  if (loading) return loading;
  if (!window.isSecureContext || !isChromium(navigator.userAgent)) {
    return Promise.resolve(null);
  }

  loading = new Promise<CastFramework | null>((resolve) => {
    const settle = (value: CastFramework | null) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => settle(null), LOAD_TIMEOUT_MS);

    window.__onGCastApiAvailable = (available: boolean) => {
      if (!available) {
        settle(null);
        return;
      }
      // The types describe a loaded SDK; before the script runs, none of it exists
      const sdk = window as unknown as {
        cast?: { framework?: CastFramework };
        chrome?: { cast?: typeof chrome.cast };
      };
      const framework = sdk.cast?.framework;
      const castApi = sdk.chrome?.cast;
      if (!framework || !castApi) {
        settle(null);
        return;
      }
      framework.CastContext.getInstance().setOptions({
        receiverApplicationId: castApi.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: castApi.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      settle(framework);
    };

    const script = document.createElement("script");
    script.src = CAST_SENDER_URL;
    script.async = true;
    script.onerror = () => settle(null);
    document.head.appendChild(script);
  });
  return loading;
}
