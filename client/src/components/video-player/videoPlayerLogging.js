/**
 * Enhanced Video.js logging for transcoding debugging
 *
 * This module adds comprehensive logging to help diagnose HLS timestamp issues
 */

/**
 * Setup comprehensive Video.js event logging
 */
export const setupVideoJsLogging = (player) => {
  console.log("[VideoJS] Setting up enhanced logging");

  // Metadata loaded
  player.on('loadedmetadata', () => {
    console.log('[VideoJS] Loaded metadata:', {
      duration: player.duration(),
      currentTime: player.currentTime(),
      readyState: player.readyState()
    });
  });

  // Progress (new data loaded into buffer)
  player.on('progress', () => {
    const buffered = player.buffered();
    if (buffered.length > 0) {
      const ranges = [];
      for (let i = 0; i < buffered.length; i++) {
        ranges.push({
          start: buffered.start(i).toFixed(2),
          end: buffered.end(i).toFixed(2)
        });
      }
      console.log('[VideoJS] Buffer progress:', {
        ranges,
        currentTime: player.currentTime().toFixed(2)
      });
    }
  });

  // Timeupdate (playback position changed)
  let lastLoggedTime = -1;
  player.on('timeupdate', () => {
    const currentTime = player.currentTime();
    // Log every 2 seconds to avoid spam
    if (Math.floor(currentTime) % 2 === 0 && Math.floor(currentTime) !== lastLoggedTime) {
      lastLoggedTime = Math.floor(currentTime);

      const buffered = player.buffered();
      let bufferEnd = 0;
      if (buffered.length > 0) {
        bufferEnd = buffered.end(buffered.length - 1);
      }

      console.log('[VideoJS] Timeupdate:', {
        currentTime: currentTime.toFixed(2),
        bufferEnd: bufferEnd.toFixed(2),
        bufferAhead: (bufferEnd - currentTime).toFixed(2)
      });
    }
  });

  // Playing (playback started)
  player.on('playing', () => {
    console.log('[VideoJS] Playing started');
  });

  // Waiting (playback paused due to buffering)
  player.on('waiting', () => {
    console.log('[VideoJS] Waiting for data (buffering)');
  });

  // Seeking
  player.on('seeking', () => {
    console.log('[VideoJS] Seeking to:', player.currentTime().toFixed(2));
  });

  // Seeked (seek completed)
  player.on('seeked', () => {
    console.log('[VideoJS] Seeked to:', player.currentTime().toFixed(2));
  });

  // Stalled (trying to fetch but no data received)
  player.on('stalled', () => {
    console.warn('[VideoJS] Stalled - no data received');
  });

  // Suspend (browser stopped fetching)
  player.on('suspend', () => {
    console.log('[VideoJS] Suspend - browser stopped fetching');
  });

  // Error
  player.on('error', () => {
    const error = player.error();
    console.error('[VideoJS] Error:', {
      code: error?.code,
      message: error?.message,
      type: error?.type
    });
  });

  // Ended (playback finished)
  player.on('ended', () => {
    console.log('[VideoJS] Playback ended');
  });

  // VHS-specific logging (if available)
  if (player.tech_ && player.tech_.vhs) {
    console.log('[VideoJS] VHS tech detected, setting up VHS logging');

    const vhs = player.tech_.vhs;

    // Timestamp offset changes
    vhs.on('timestampoffset', (e) => {
      console.log('[VHS] Timestamp offset:', e);
    });
  }
};

/**
 * Setup network request logging to track segment loads
 */
export const setupNetworkLogging = () => {
  console.log("[Network] Setting up segment load logging");

  const originalXHR = window.XMLHttpRequest;
  const XHRProxy = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;

    xhr.open = function(method, url, ...args) {
      // Only log HLS-related requests
      if (url.includes('.ts') || url.includes('.m4s') || url.includes('segment') || url.includes('.m3u8')) {
        const startTime = Date.now();

        console.log('[Network] Loading:', url);

        xhr.addEventListener('load', function() {
          const duration = Date.now() - startTime;
          console.log('[Network] Loaded:', {
            url,
            status: xhr.status,
            duration: `${duration}ms`,
            size: xhr.response?.byteLength || 'unknown'
          });
        });

        xhr.addEventListener('error', function() {
          console.error('[Network] Error loading:', url);
        });

        xhr.addEventListener('timeout', function() {
          console.error('[Network] Timeout loading:', url);
        });
      }

      return originalOpen.apply(xhr, [method, url, ...args]);
    };

    return xhr;
  };

  window.XMLHttpRequest = XHRProxy;
};

/**
 * Log initial setup information
 */
export const logInitialSetup = (scene, compatibility, playbackMode) => {
  console.log("=".repeat(80));
  console.log("[PLAYBACK INIT] Starting new playback session");
  console.log("=".repeat(80));
  console.log("[PLAYBACK INIT] Scene:", {
    id: scene.id,
    title: scene.title,
    duration: scene.files?.[0]?.duration,
    codec: `${scene.files?.[0]?.video_codec}/${scene.files?.[0]?.audio_codec}`,
    resolution: `${scene.files?.[0]?.width}x${scene.files?.[0]?.height}`
  });
  console.log("[PLAYBACK INIT] Compatibility:", compatibility);
  console.log("[PLAYBACK INIT] Playback mode:", playbackMode);
  console.log("=".repeat(80));
};
