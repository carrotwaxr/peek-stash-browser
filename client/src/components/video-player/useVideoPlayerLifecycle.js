import { useEffect } from "react";
import videojs from "video.js";
import airplay from "@silvermine/videojs-airplay";
import chromecast from "@silvermine/videojs-chromecast";
import "./vtt-thumbnails.js";
import "@silvermine/videojs-airplay/dist/silvermine-videojs-airplay.css";
import "@silvermine/videojs-chromecast/dist/silvermine-videojs-chromecast.css";

// Register Video.js plugins
airplay(videojs);
chromecast(videojs);

/**
 * useVideoPlayerLifecycle
 *
 * Manages Video.js player initialization and cleanup.
 * Creates player instance programmatically (outside React's control) to avoid DOM conflicts.
 */
export function useVideoPlayerLifecycle({
  videoRef,
  playerRef,
  stopTracking,
  scene,
}) {
  // Initialize Video.js player once (Stash's pattern - programmatic element creation)
  useEffect(() => {
    const container = videoRef.current;
    if (!container) {
      return;
    }

    // Create video element programmatically (not managed by React)
    const videoElement = document.createElement("video-js");
    videoElement.setAttribute("data-vjs-player", "true");
    videoElement.setAttribute("crossorigin", "anonymous");
    videoElement.classList.add("vjs-big-play-centered");

    // Append to container before initialization (Video.js needs element in DOM)
    container.appendChild(videoElement);

    // Initialize Video.js
    const player = videojs(videoElement, {
      autoplay: false,
      controls: true,
      controlBar: {
        pictureInPictureToggle: false,
      },
      responsive: true,
      fluid: true,
      preload: "none", // Match Stash - don't load until user interacts
      liveui: false,
      playsinline: true, // Match Stash
      techOrder: ["chromecast", "html5"], // Enable Chromecast and AirPlay
      html5: {
        vhs: {
          overrideNative: !videojs.browser.IS_SAFARI,
          enableLowInitialPlaylist: false,
          smoothQualityChange: true,
          useBandwidthFromLocalStorage: true,
          limitRenditionByPlayerDimensions: true,
          useDevicePixelRatio: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
      plugins: {
        airPlay: {},
        chromecast: {},
        qualityLevels: {},
        vttThumbnails: {
          showTimestamp: true,
          spriteUrl: scene?.paths?.sprite || null,
        },
      },
    });

    playerRef.current = player;
    player.focus();

    player.ready(() => {
      // Player ready
    });

    // Cleanup: dispose player and remove element
    return () => {
      stopTracking();
      playerRef.current = null;

      try {
        player.dispose();
      } catch (error) {
        console.error("[LIFECYCLE] Disposal error:", error);
      }

      if (videoElement.parentNode) {
        videoElement.remove();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update VTT thumbnails source when scene changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene?.paths?.vtt || !scene?.paths?.sprite) return;

    const vttPlugin = player.vttThumbnails?.();
    if (vttPlugin) {
      vttPlugin.src(scene.paths.vtt, scene.paths.sprite);
    }
  }, [scene?.paths?.vtt, scene?.paths?.sprite, playerRef]);
}
