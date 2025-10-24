import videojs from "video.js";

// Set VideoJS global log level to reduce console spam
videojs.log.level("warn");

/**
 * Setup playlist navigation buttons in Video.js control bar
 * Adds Previous/Next buttons for navigating between scenes
 */
export const setupPlaylistControls = (
  player,
  playlist,
  currentIndex,
  onPrevious,
  onNext
) => {
  const addButtons = () => {
    // Check if controlBar exists
    if (!player.controlBar || !player.controlBar.el) {
      setTimeout(addButtons, 200);
      return;
    }

    const controlBar = player.controlBar.el();
    if (!controlBar) {
      setTimeout(addButtons, 200);
      return;
    }

    const playToggle = controlBar.querySelector(".vjs-play-control");

    if (!playToggle) {
      setTimeout(addButtons, 200);
      return;
    }

    // Remove any existing playlist buttons first
    const existingPrev = controlBar.querySelector(".vjs-playlist-prev");
    const existingNext = controlBar.querySelector(".vjs-playlist-next");
    if (existingPrev) existingPrev.remove();
    if (existingNext) existingNext.remove();

    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < playlist.scenes.length - 1;

    // Create Previous button
    const prevButton = document.createElement("button");
    prevButton.className = "vjs-control vjs-button vjs-playlist-prev";
    prevButton.title = hasPrevious ? "Previous Video" : "No previous video";
    prevButton.disabled = !hasPrevious;
    prevButton.innerHTML = `
      <span class="vjs-icon-placeholder" aria-hidden="true"></span>
      <span class="vjs-control-text" aria-live="polite">Previous Video</span>
    `;

    if (hasPrevious) {
      prevButton.addEventListener("click", (e) => {
        e.preventDefault();
        onPrevious();
      });
    }

    playToggle.parentNode.insertBefore(prevButton, playToggle);

    // Create Next button
    const nextButton = document.createElement("button");
    nextButton.className = "vjs-control vjs-button vjs-playlist-next";
    nextButton.title = hasNext ? "Next Video" : "No next video";
    nextButton.disabled = !hasNext;
    nextButton.innerHTML = `
      <span class="vjs-icon-placeholder" aria-hidden="true"></span>
      <span class="vjs-control-text" aria-live="polite">Next Video</span>
    `;

    if (hasNext) {
      nextButton.addEventListener("click", (e) => {
        e.preventDefault();
        onNext();
      });
    }

    playToggle.parentNode.insertBefore(nextButton, playToggle.nextSibling);
  };

  player.ready(() => {
    setTimeout(addButtons, 100);
  });
};

/**
 * Setup seeking handlers for transcoded content
 * Uses smart seeking on backend to reuse segments when possible
 */
export const setupTranscodedSeeking = (player, sessionId, api) => {
  let isTranscodedSeeking = false;
  let lastSeekTime = 0;
  let hasPlayedOnce = false;
  let currentSessionId = sessionId; // Track current session ID
  const SEEK_THRESHOLD = 12; // Match backend smart seek threshold (3 segments × 4s)

  // Enable seeking only after playback has started
  player.one("playing", () => {
    hasPlayedOnce = true;
  });

  player.on("seeking", () => {
    if (isTranscodedSeeking) {
      return;
    }

    if (!hasPlayedOnce) {
      return;
    }

    const currentTime = player.currentTime();
    const seekDistance = Math.abs(currentTime - lastSeekTime);

    if (seekDistance > SEEK_THRESHOLD) {
      isTranscodedSeeking = true;
      const targetSeekTime = currentTime; // Save the target time

      api
        .post("/video/seek", {
          sessionId: currentSessionId,
          startTime: targetSeekTime,
        })
        .then((response) => {
          const newSessionId = response.data.sessionId;
          const sessionChanged = newSessionId !== currentSessionId;

          if (sessionChanged) {
            // Backend started transcoding from new position, but we keep using the same playlist
            // The playlist represents segments 0-end, so Video.js will request the correct segment
            // Backend's segment renaming will catch up before Video.js requests it
            // Update session ID for future seeks
            currentSessionId = newSessionId;
          }

          // In both cases, just let Video.js handle the seek
          // It will request the correct segment based on the target time
          isTranscodedSeeking = false;

          lastSeekTime = targetSeekTime;
        })
        .catch(() => {
          isTranscodedSeeking = false;
        });
    }
  });
};

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
 * Setup double-tap to toggle fullscreen on mobile, single-tap to play/pause
 */
export const setupDoubleTapFullscreen = (player) => {
  let lastTap = 0;
  let singleTapTimer = null;
  const doubleTapDelay = 300; // milliseconds

  const videoElement = player.el().querySelector("video");
  if (!videoElement) return;

  const handleDoubleTap = (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;

    if (tapLength < doubleTapDelay && tapLength > 0) {
      // Double tap detected - handle fullscreen
      e.preventDefault();

      // Cancel pending single-tap play/pause action
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }

      if (player.isFullscreen && player.isFullscreen()) {
        player.exitFullscreen();
      } else if (player.requestFullscreen) {
        player.requestFullscreen();
      }

      lastTap = 0; // Reset to prevent triple-tap
    } else {
      // Potential single tap - wait to confirm
      lastTap = currentTime;

      // Cancel any existing timer
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
      }

      // Set timer to trigger play/pause after doubleTapDelay
      singleTapTimer = setTimeout(() => {
        // Confirm it's still a single tap (no second tap came)
        if (lastTap === currentTime) {
          // Toggle play/pause
          if (player.paused()) {
            player.play();
          } else {
            player.pause();
          }
        }
        singleTapTimer = null;
      }, doubleTapDelay);
    }
  };

  videoElement.addEventListener("touchend", handleDoubleTap);

  // Return cleanup function
  return () => {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
    }
    videoElement.removeEventListener("touchend", handleDoubleTap);
  };
};
