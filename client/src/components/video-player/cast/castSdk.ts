/**
 * Loader for Google's Cast sender framework.
 *
 * Part of the lazy `castSdk` chunk: `useCast` requests it only where Cast can
 * work (`canCast`: a secure context in a Chromium browser) and TV mode is off,
 * so any other tab never contacts Google. Those checks are the caller's, not
 * the loader's.
 */

export type CastFramework = typeof cast.framework;

const CAST_SENDER_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const LOAD_TIMEOUT_MS = 10_000;

/** One script load per page */
let loading: Promise<CastFramework | null> | null = null;

export function loadCastSdk(): Promise<CastFramework | null> {
  if (loading) return loading;

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
