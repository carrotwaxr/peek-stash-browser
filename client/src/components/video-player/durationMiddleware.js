/**
 * Video.js middleware to handle duration and seeking for transcoded streams
 * Based on Stash's offsetMiddleware (live.ts)
 *
 * Problem: HLS/transcoded streams report incrementing duration as segments are generated
 * Solution: Override duration() to return the source's duration property
 *
 * This middleware also handles time offset for transcoded streams that use the offset property.
 */

import videojs from 'video.js';

// Delay before loading new source after setting currentTime (matches Stash)
const LOAD_DELAY = 200;

function offsetMiddleware(player) {
  let tech;
  let source = null;
  let offsetStart;
  let seeking = 0;
  let loadSourceTimeout = null;

  function updateOffsetStart(offset) {
    offsetStart = offset;

    if (!tech) return;
    offset = offset ?? 0;

    // Handle subtitle/caption time offset adjustments
    const tracks = tech.remoteTextTracks();
    for (let i = 0; i < tracks.length; i++) {
      const { cues } = tracks[i];
      if (cues) {
        for (let j = 0; j < cues.length; j++) {
          const cue = cues[j];
          if (cue._startTime === undefined || cue._endTime === undefined) {
            continue;
          }
          cue.startTime = cue._startTime - offset;
          cue.endTime = cue._endTime - offset;
        }
      }
    }
  }

  function loadSource(seconds) {
    // Add ?start=X parameter to source URL
    const srcUrl = new URL(source.src, window.location.origin);
    srcUrl.searchParams.set('start', seconds.toString());
    source.src = srcUrl.toString();

    const poster = player.poster();
    const playbackRate = tech.playbackRate();
    seeking = tech.paused() ? 1 : 2;

    player.poster('');
    tech.setSource(source);
    tech.setPlaybackRate(playbackRate);

    tech.one('canplay', () => {
      player.poster(poster);
      if (seeking === 1 || tech.scrubbing?.()) {
        tech.pause();
      }
      seeking = 0;
    });

    tech.trigger('timeupdate');
    tech.trigger('pause');
    tech.trigger('seeking');
    tech.play();
  }

  return {
    setTech(newTech) {
      tech = newTech;
    },

    setSource(srcObj, next) {
      // Reset offset handling based on source properties
      if (srcObj.offset && srcObj.duration) {
        updateOffsetStart(0);
      } else {
        updateOffsetStart(undefined);
      }

      // Store the source object with its metadata
      source = srcObj;

      // Continue with normal source loading
      next(null, srcObj);
    },

    duration(seconds) {
      // If source has explicit duration property, use it
      // This overrides the duration reported by HLS manifests
      if (source && source.duration !== undefined) {
        return source.duration;
      }

      // Otherwise return the player's reported duration
      return seconds;
    },

    buffered(buffers) {
      if (offsetStart === undefined) {
        return buffers;
      }

      const timeRanges = [];
      for (let i = 0; i < buffers.length; i++) {
        const start = buffers.start(i) + offsetStart;
        const end = buffers.end(i) + offsetStart;
        timeRanges.push([start, end]);
      }

      return videojs.createTimeRanges(timeRanges);
    },

    currentTime(seconds) {
      return (offsetStart ?? 0) + seconds;
    },

    setCurrentTime(seconds) {
      if (offsetStart === undefined) {
        return seconds;
      }

      const offsetSeconds = seconds - offsetStart;
      const buffers = tech.buffered();

      // Check if seek point is in buffer, just seek normally
      for (let i = 0; i < buffers.length; i++) {
        const start = buffers.start(i);
        const end = buffers.end(i);
        if (start <= offsetSeconds && offsetSeconds <= end) {
          return offsetSeconds;
        }
      }

      // Seek point not buffered - reload stream with ?start=X parameter
      // Update offset to the seek point
      updateOffsetStart(seconds);

      // Debounce loadSource calls to avoid rapid reloading
      if (loadSourceTimeout) {
        clearTimeout(loadSourceTimeout);
      }
      loadSourceTimeout = setTimeout(() => loadSource(seconds), LOAD_DELAY);

      // Return 0 to seek to beginning of new stream (which starts at the requested time)
      return 0;
    },

    callPlay() {
      if (seeking) {
        seeking = 2;
        return videojs.middleware.TERMINATOR;
      }
    }
  };
}

// Register middleware for all sources
videojs.use('*', offsetMiddleware);

export default offsetMiddleware;
