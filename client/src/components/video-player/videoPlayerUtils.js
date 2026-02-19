import videojs from "video.js";

// Import duration middleware (registers via videojs.use)
import "./durationMiddleware.js";

// Set VideoJS global log level to reduce console spam
videojs.log.level("warn");

/**
 * Show or hide the playback rate control
 * Only visible for direct play (transcoded HLS doesn't support playback rate)
 */
export const togglePlaybackRateControl = (player, show) => {
  if (!player || player.isDisposed()) return;

  const controlBar = player.controlBar;
  if (!controlBar) return;

  const playbackRateControl = controlBar.getChild("PlaybackRateMenuButton");
  if (playbackRateControl) {
    if (show) {
      playbackRateControl.show();
    } else {
      playbackRateControl.hide();
    }
  }
};

/**
 * Setup subtitles/captions for a scene (uses sourceSelector plugin - Stash pattern)
 * Adds text tracks via sourceSelector for proper lifecycle management
 * Video.js automatically shows/hides the caption button based on available tracks
 */
export const setupSubtitles = (player, sceneId, captions, instanceId) => {
  if (!player || player.isDisposed()) return;
  if (!captions || captions.length === 0) return;

  // Get sourceSelector plugin for track management
  const sourceSelector = player.sourceSelector();

  // Language map matching Stash's implementation
  const languageMap = new Map([
    ["de", "Deutsche"],
    ["en", "English"],
    ["es", "Español"],
    ["fr", "Français"],
    ["it", "Italiano"],
    ["ja", "日本"],
    ["ko", "한국인"],
    ["nl", "Holandés"],
    ["pt", "Português"],
    ["ru", "Русский"],
    ["00", "Unknown"],
  ]);

  // Get browser's default language code (same logic as Stash)
  const getDefaultLanguageCode = () => {
    let languageCode = window.navigator.language;

    if (languageCode.indexOf("-") !== -1) {
      languageCode = languageCode.split("-")[0];
    }

    if (languageCode.indexOf("_") !== -1) {
      languageCode = languageCode.split("_")[0];
    }

    return languageCode;
  };

  const defaultLanguageCode = getDefaultLanguageCode();
  let hasDefault = false;

  // Add tracks via sourceSelector (auto-cleanup on source change)
  captions.forEach((caption) => {
    const lang = caption.language_code;
    let label = lang;

    if (languageMap.has(lang)) {
      label = languageMap.get(lang);
    }

    // Include caption type in label (matching Stash)
    label = label + " (" + caption.caption_type + ")";

    // Set first matching browser language as default
    const setAsDefault = !hasDefault && defaultLanguageCode === lang;
    if (setAsDefault) {
      hasDefault = true;
    }

    const trackOptions = {
      kind: "captions", // Use "captions" not "subtitles" to match Stash
      src: `/api/scene/${sceneId}/caption?lang=${lang}&type=${caption.caption_type}${instanceId ? `&instanceId=${instanceId}` : ""}`,
      srclang: lang,
      label: label,
      default: setAsDefault,
    };

    // Use sourceSelector.addTextTrack for lifecycle management
    // false = auto-cleanup on source change
    sourceSelector.addTextTrack(trackOptions, false);
  });
};
