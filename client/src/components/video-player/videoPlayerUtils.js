import videojs from "video.js";

// Set VideoJS global log level to reduce console spam
// Options: 'all', 'debug', 'info', 'warn', 'error', 'off'
videojs.log.level("warn");

/**
 * Configure HLS for VOD (Video On Demand) behavior
 * Sets duration from scene metadata when player reports Infinity
 */
export const setupHLSforVOD = (player, scene) => {
  let durationSet = false;

  player.on("loadedmetadata", () => {
    const duration = scene?.files?.[0]?.duration;
    if (!durationSet && duration && player.duration() === Infinity) {
      player.duration(duration);
      durationSet = true;
    }
  });
};

/**
 * Manage loading buffer for smooth playback
 * Pauses playback when buffer is low and resumes when sufficient
 */
export const setupLoadingBuffer = (player, minBufferSeconds = 6) => {
  let isWaitingForBuffer = false;
  let hasStartedPlayback = false;
  let userPaused = false;

  const checkBuffer = () => {
    const currentTime = player.currentTime();
    const buffered = player.buffered();

    if (buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1);
      const bufferAhead = bufferedEnd - currentTime;

      // If we're playing and buffer is low, pause and wait
      if (
        !player.paused() &&
        bufferAhead < minBufferSeconds &&
        !isWaitingForBuffer
      ) {
        isWaitingForBuffer = true;
        userPaused = false;
        player.pause();
        player.addClass("vjs-waiting");
      }

      // If we're waiting for buffer and it's now sufficient, resume
      if (isWaitingForBuffer && bufferAhead >= minBufferSeconds) {
        isWaitingForBuffer = false;
        player.removeClass("vjs-waiting");

        if (!userPaused) {
          player.play().catch(() => {
            // Failed to resume playback after buffering
          });
        }
      }
    }
  };

  // Track user-initiated pauses
  player.on("pause", () => {
    if (!isWaitingForBuffer) {
      userPaused = true;
    }
  });

  // Track user-initiated plays
  player.on("play", () => {
    userPaused = false;
  });

  // Track when playback actually starts
  player.on("playing", () => {
    hasStartedPlayback = true;
    userPaused = false;
  });

  // Check buffer on progress events (new data loaded)
  player.on("progress", () => {
    checkBuffer();
  });

  // Check buffer during playback
  player.on("timeupdate", () => {
    if (hasStartedPlayback && !player.paused()) {
      checkBuffer();
    }
  });
};

/**
 * Setup playlist navigation buttons in Video.js control bar
 * Adds Previous/Next buttons on either side of the play button
 */
export const setupPlaylistControls = (
  player,
  playlist,
  currentIndex,
  onPrevious,
  onNext
) => {
  const addButtons = () => {
    const controlBar = player.controlBar.el();
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
      <span class="vjs-icon-placeholder" aria-hidden="true">‹‹</span>
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
      <span class="vjs-icon-placeholder" aria-hidden="true">››</span>
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
 * Setup quality selector for HLS streams
 * Creates a dropdown menu to manually select quality levels
 */
export const setupQualitySelector = (player) => {
  player.ready(() => {
    const qualityLevels = player.qualityLevels();
    let qualitySelectorCreated = false;

    const createQualityMenu = () => {
      if (qualitySelectorCreated) return;

      const qualities = ["Auto"];
      const qualityMap = new Map();

      // Collect available qualities
      for (let i = 0; i < qualityLevels.length; i++) {
        const quality = qualityLevels[i];
        const height = quality.height;
        const label = `${height}p`;

        if (!qualities.includes(label)) {
          qualities.push(label);
          qualityMap.set(label, i);
        }
      }

      // Add quality selector to control bar
      if (qualities.length > 1) {
        qualitySelectorCreated = true;

        const qualityButton = document.createElement("div");
        qualityButton.className = "vjs-quality-selector vjs-control vjs-button";

        const activeQuality =
          qualityLevels.selectedIndex >= 0
            ? `${qualityLevels[qualityLevels.selectedIndex].height}p`
            : "Auto";

        qualityButton.innerHTML = `
          <button class="vjs-quality-button" type="button" aria-live="polite" title="Quality">
            <span class="vjs-icon-chapters"></span>
            <span class="vjs-quality-text">${activeQuality}</span>
          </button>
          <div class="vjs-quality-menu" style="display: none;">
            ${qualities
              .map(
                (q) =>
                  `<div class="vjs-quality-item ${
                    q === activeQuality ? "vjs-selected" : ""
                  }" data-quality="${q}">${q}</div>`
              )
              .join("")}
          </div>
        `;

        const controlBar = player.controlBar.el();
        const fullscreenToggle = controlBar.querySelector(
          ".vjs-fullscreen-control"
        );
        controlBar.insertBefore(qualityButton, fullscreenToggle);

        // Handle quality selection
        qualityButton.addEventListener("click", () => {
          const menu = qualityButton.querySelector(".vjs-quality-menu");
          menu.style.display = menu.style.display === "none" ? "block" : "none";
        });

        qualityButton.querySelectorAll(".vjs-quality-item").forEach((item) => {
          item.addEventListener("click", (e) => {
            const selectedQuality = e.target.dataset.quality;
            const button = qualityButton.querySelector(".vjs-quality-text");
            button.textContent = selectedQuality;

            // Update selected class
            qualityButton
              .querySelectorAll(".vjs-quality-item")
              .forEach((i) => i.classList.remove("vjs-selected"));
            e.target.classList.add("vjs-selected");

            if (selectedQuality === "Auto") {
              for (let i = 0; i < qualityLevels.length; i++) {
                qualityLevels[i].enabled = true;
              }
            } else {
              for (let i = 0; i < qualityLevels.length; i++) {
                qualityLevels[i].enabled = false;
              }
              const selectedIndex = qualityMap.get(selectedQuality);
              if (selectedIndex !== undefined) {
                qualityLevels[selectedIndex].enabled = true;
              }
            }

            qualityButton.querySelector(".vjs-quality-menu").style.display =
              "none";
          });
        });

        // Update displayed quality when it changes
        qualityLevels.on("change", () => {
          const currentQuality =
            qualityLevels.selectedIndex >= 0
              ? `${qualityLevels[qualityLevels.selectedIndex].height}p`
              : "Auto";
          const button = qualityButton.querySelector(".vjs-quality-text");
          if (button && button.textContent === "Auto") {
            button.textContent = currentQuality;
          }
        });
      }
    };

    qualityLevels.on("addqualitylevel", createQualityMenu);
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
    const duration = player.duration();
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
 * Get Video.js options configuration
 */
export const getVideoJsOptions = (sources) => {
  return {
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    sources: sources,
    playbackRates: [0.5, 1, 1.25, 1.5, 2],
    liveui: false,
    html5: {
      vhs: {
        overrideNative: !videojs.browser.IS_SAFARI,
        enableLowInitialPlaylist: false,
        smoothQualityChange: true,
        useBandwidthFromLocalStorage: true,
        limitRenditionByPlayerDimensions: true,
        useDevicePixelRatio: true,
        allowSeeksWithinUnsafeLiveWindow: true,
        liveRangeSafeTimeDelta: 30,
        playlistExclusionDuration: 300,
        handlePartialData: true,
        experimentalBufferBasedABR: false,
      },
      nativeAudioTracks: false,
      nativeVideoTracks: false,
    },
    plugins: {
      qualityLevels: {},
    },
  };
};

/**
 * Disable live tracker to force VOD UI mode
 */
export const disableLiveTracker = (player, context = "") => {
  if (player.liveTracker) {
    player.liveTracker.dispose();
    player.liveTracker = null;
  }
};
