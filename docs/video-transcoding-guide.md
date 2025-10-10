# Video.js Transcoding Configuration Guide

## Overview

This document outlines the complete Video.js configuration for providing seamless transcoded video playback that matches direct play behavior. It covers frontend implementation details and backend requirements for HLS transcoding with seeking support.

## Table of Contents

- [Frontend Configuration](#frontend-configuration)
- [Backend Requirements](#backend-requirements)
- [Video.js Setup](#videojs-setup)
- [Quality Selection System](#quality-selection-system)
- [Seeking Implementation](#seeking-implementation)
- [HLS Playlist Structure](#hls-playlist-structure)
- [FFmpeg Integration](#ffmpeg-integration)

---

## Frontend Configuration

### Key Video.js Options for VOD (Video On Demand) Behavior

The main challenge with HLS streams is that Video.js often treats them as live streams by default, which prevents seeking and proper duration display. Here's how to configure it for VOD behavior:

```javascript
const videoJsOptions = {
  autoplay: true,
  controls: true,
  responsive: true,
  fluid: true,
  playbackRates: [0.5, 1, 1.25, 1.5, 2], // Playback speed options
  html5: {
    vhs: {
      // VOD Configuration for seeking and duration
      overrideNative: !videojs.browser.IS_SAFARI, // Use native HLS on Safari
      enableLowInitialPlaylist: false, // Don't treat as live stream
      smoothQualityChange: true, // Smooth quality transitions
      useBandwidthFromLocalStorage: true, // Remember bandwidth
      limitRenditionByPlayerDimensions: true, // Optimize for player size
      useDevicePixelRatio: true, // Use device pixel ratio for quality
      allowSeeksWithinUnsafeLiveWindow: true, // Allow seeking in live-like streams
      handlePartialData: true, // Handle partial segments for seeking
      experimentalBufferBasedABR: false, // Use traditional ABR
    },
    nativeAudioTracks: false, // Handle audio tracks via Video.js
    nativeVideoTracks: false, // Handle video tracks via Video.js
  },
  plugins: {
    qualityLevels: {}, // Enable quality selector plugin
  },
};
```

### Critical HLS VOD Configuration

```javascript
const setupHLSforVOD = (player, video) => {
  player.ready(() => {
    const tech = player.tech();
    if (tech && tech.vhs) {
      const vhs = tech.vhs;

      // Override live detection
      vhs.playlistController_.media_ = () => {
        const media = vhs.playlists.media();
        if (media) {
          // Remove live characteristics to enable seeking
          media.endList = true; // Mark as ended (not live)
          media.live = false; // Explicitly not live
          media.dvr = false; // Not DVR

          // Set duration if we know it from video metadata
          if (video?.files?.[0]?.duration) {
            media.targetDuration = video.files[0].duration;
          }
        }
        return media;
      };

      // Enable seeking by removing live window restrictions
      if (vhs.seekable) {
        const originalSeekable = vhs.seekable;
        vhs.seekable = () => {
          const seekableRange = originalSeekable.call(vhs);
          // If we have video duration, use that for seekable range
          if (video?.files?.[0]?.duration) {
            return {
              length: 1,
              start: () => 0,
              end: () => video.files[0].duration,
            };
          }
          return seekableRange;
        };
      }
    }
  });
};
```

---

## Quality Selection System

### Implementation Overview

The quality selector provides users with manual control over video quality with options: **Auto, 1080p, 720p, 480p, 360p**.

### Quality Selector Setup

```javascript
const setupQualitySelector = (player) => {
  player.ready(() => {
    const qualityLevels = player.qualityLevels();

    const createQualityMenu = () => {
      const qualities = ["Auto"];
      const qualityMap = new Map();

      // Collect available qualities from HLS stream
      for (let i = 0; i < qualityLevels.length; i++) {
        const quality = qualityLevels[i];
        const height = quality.height;
        const label = `${height}p`;

        if (!qualities.includes(label)) {
          qualities.push(label);
          qualityMap.set(label, i);
        }
      }

      // Create custom quality selector UI
      if (qualities.length > 1) {
        const qualityButton = document.createElement("div");
        qualityButton.className = "vjs-quality-selector vjs-control vjs-button";
        qualityButton.innerHTML = `
          <button class="vjs-quality-button" type="button" title="Quality">
            <span class="vjs-icon-chapters"></span>
            <span class="vjs-quality-text">Auto</span>
          </button>
          <div class="vjs-quality-menu" style="display: none;">
            ${qualities
              .map(
                (q) =>
                  `<div class="vjs-quality-item" data-quality="${q}">${q}</div>`
              )
              .join("")}
          </div>
        `;

        // Insert into control bar
        const controlBar = player.controlBar.el();
        const fullscreenToggle = controlBar.querySelector(
          ".vjs-fullscreen-control"
        );
        controlBar.insertBefore(qualityButton, fullscreenToggle);

        // Handle quality selection
        setupQualityEventHandlers(qualityButton, qualityLevels, qualityMap);
      }
    };

    qualityLevels.on("addqualitylevel", createQualityMenu);
  });
};
```

### Quality Selection Logic

```javascript
// Auto mode: Enable all qualities for adaptive bitrate
if (selectedQuality === "Auto") {
  for (let i = 0; i < qualityLevels.length; i++) {
    qualityLevels[i].enabled = true;
  }
} else {
  // Manual mode: Enable only selected quality
  for (let i = 0; i < qualityLevels.length; i++) {
    qualityLevels[i].enabled = false;
  }
  const selectedIndex = qualityMap.get(selectedQuality);
  if (selectedIndex !== undefined) {
    qualityLevels[selectedIndex].enabled = true;
  }
}
```

---

## Seeking Implementation

### Frontend Seeking Handler

```javascript
const setupTranscodedSeeking = (player, sceneId) => {
  let isTranscodedSeeking = false;

  player.on("seeking", () => {
    if (isTranscodedSeeking) return; // Prevent recursive calls

    const currentTime = player.currentTime();
    const duration = player.duration();

    console.log(`Seeking to: ${currentTime}s of ${duration}s`);

    // Send seek request to backend for transcoding restart
    if (currentTime > 0) {
      api
        .post(`/play/${sceneId}/seek`, {
          startTime: currentTime,
        })
        .then((response) => {
          console.log("Seek request sent to backend", response.data);
        })
        .catch((error) => {
          console.error("Error seeking:", error);
        });
    }
  });

  // Monitor buffering progress
  player.on("progress", () => {
    const buffered = player.buffered();
    if (buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1);
      const currentTime = player.currentTime();
      const bufferAhead = bufferedEnd - currentTime;

      // Buffer management logic
      if (bufferAhead < 10 && !player.paused()) {
        console.log("Buffer running low, may need transcoding adjustment");
      }
    }
  });
};
```

---

## Backend Requirements

### 1. Seeking API Endpoint

**Endpoint:** `POST /api/play/:sceneId/seek`

**Request Body:**

```json
{
  "startTime": 125.5
}
```

**Response:**

```json
{
  "success": true,
  "message": "Transcoding restarted from 125.5s",
  "playlistUrl": "/api/play/123/master.m3u8"
}
```

### 2. Seeking Logic Flow

```
1. User seeks to time T seconds
2. Frontend sends POST /api/play/:id/seek { startTime: T }
3. Backend receives seek request
4. Backend kills current FFmpeg transcoding process
5. Backend starts new FFmpeg process from time T
6. Backend updates HLS playlists to start from new position
7. Frontend automatically picks up new segments
8. Playback continues seamlessly from time T
```

### 3. Transcoding Session Management

```javascript
// Backend pseudocode for seek handling
class TranscodingSession {
  constructor(sceneId, startTime = 0) {
    this.sceneId = sceneId;
    this.startTime = startTime;
    this.ffmpegProcess = null;
    this.segmentIndex = 0;
  }

  async handleSeek(newStartTime) {
    // Kill existing process
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGTERM");
    }

    // Cleanup old segments
    await this.cleanupSegments();

    // Start new transcoding from seek position
    this.startTime = newStartTime;
    this.segmentIndex = 0;
    await this.startTranscoding();
  }

  async startTranscoding() {
    const qualities = ["360p", "480p", "720p", "1080p"];

    for (const quality of qualities) {
      this.startQualityTranscoding(quality);
    }
  }
}
```

---

## HLS Playlist Structure

### Master Playlist (`master.m3u8`)

```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
360p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480,CODECS="avc1.640028,mp4a.40.2"
480p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/index.m3u8
```

### Individual Quality Playlist (`720p/index.m3u8`)

**During Active Transcoding:**

```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD

#EXTINF:4.000000,
segment_000.ts
#EXTINF:4.000000,
segment_001.ts
#EXTINF:4.000000,
segment_002.ts
```

**After Transcoding Complete:**

```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD

#EXTINF:4.000000,
segment_000.ts
#EXTINF:4.000000,
segment_001.ts
#EXTINF:3.500000,
segment_002.ts
#EXT-X-ENDLIST
```

### Key Playlist Requirements

- ✅ **`#EXT-X-PLAYLIST-TYPE:VOD`** - Marks as Video On Demand
- ✅ **`#EXT-X-ENDLIST`** - Added when transcoding is complete
- ✅ **Sequential segments** - Numbered from current start position
- ✅ **Consistent target duration** - Usually 4-6 seconds per segment

---

## FFmpeg Integration

### Basic FFmpeg Command for Seeking

```bash
# Start transcoding from specific time (e.g., 125.5 seconds)
ffmpeg -ss 125.5 -i "/path/to/video.mp4" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -f hls \
  -hls_time 4 \
  -hls_playlist_type vod \
  -hls_segment_filename "720p/segment_%03d.ts" \
  -y "720p/index.m3u8"
```

### Multi-Quality Transcoding

```bash
# Generate multiple qualities simultaneously
ffmpeg -ss ${START_TIME} -i "${INPUT_FILE}" \
  -filter_complex "
    [0:v]split=4[v1][v2][v3][v4];
    [v1]scale=640:360[v360p];
    [v2]scale=854:480[v480p];
    [v3]scale=1280:720[v720p];
    [v4]scale=1920:1080[v1080p]
  " \
  -map "[v360p]" -c:v:0 libx264 -b:v:0 800k -map 0:a -c:a:0 aac -b:a:0 96k \
    -f hls -hls_time 4 -hls_playlist_type vod \
    -hls_segment_filename "360p/segment_%03d.ts" 360p/index.m3u8 \
  -map "[v480p]" -c:v:1 libx264 -b:v:1 1400k -map 0:a -c:a:1 aac -b:a:1 128k \
    -f hls -hls_time 4 -hls_playlist_type vod \
    -hls_segment_filename "480p/segment_%03d.ts" 480p/index.m3u8 \
  -map "[v720p]" -c:v:2 libx264 -b:v:2 2800k -map 0:a -c:a:2 aac -b:a:2 128k \
    -f hls -hls_time 4 -hls_playlist_type vod \
    -hls_segment_filename "720p/segment_%03d.ts" 720p/index.m3u8 \
  -map "[v1080p]" -c:v:3 libx264 -b:v:3 5000k -map 0:a -c:a:3 aac -b:a:3 192k \
    -f hls -hls_time 4 -hls_playlist_type vod \
    -hls_segment_filename "1080p/segment_%03d.ts" 1080p/index.m3u8
```

### FFmpeg Optimization Parameters

```bash
# Optimized settings for real-time transcoding
-preset fast          # Balance between speed and compression
-tune zerolatency     # Optimize for low latency
-g 48                 # GOP size (2x segment duration at 24fps)
-keyint_min 48        # Minimum GOP size
-sc_threshold 0       # Disable scene change detection
-bf 0                 # No B-frames for lower latency
```

---

## Frontend Features Summary

### ✅ Implemented Features

- **Quality Selector** - Custom UI with Auto/1080p/720p/480p/360p options
- **VOD Seeking** - Full timeline seeking like direct play
- **Duration Display** - Shows actual video length, not live stream behavior
- **Seeking Communication** - Sends seek requests to backend API
- **Buffer Monitoring** - Tracks transcoding progress and buffer health
- **Playback Rate Control** - Speed options from 0.5x to 2x
- **Visual Indicators** - Shows Direct Play vs Transcoded status
- **Smooth Quality Switching** - Seamless quality changes during playback

### CSS Styling

Custom CSS provides:

- Quality selector dropdown menu
- Buffer progress indicators
- Seeking overlay animations
- Playback method badges
- Enhanced control bar styling

---

## Development Workflow

### 1. Testing Direct Play vs Transcoded

```javascript
// VideoPlayer automatically detects format compatibility
const compatibility = canDirectPlayVideo(firstFile);
const canDirectPlay = compatibility?.canDirectPlay || false;

// API call includes direct parameter
const apiUrl = `http://localhost:8000/api/play/${scene.id}?direct=${canDirectPlay}`;
```

### 2. Debugging HLS Issues

```javascript
// Enable Video.js debugging
videojs.log.level("debug");

// Monitor HLS events
player.on("loadedmetadata", () => console.log("Duration:", player.duration()));
player.on("progress", () => console.log("Buffer:", player.buffered()));
player.on("seeking", () => console.log("Seeking to:", player.currentTime()));
```

### 3. Backend Integration Points

- **Format Detection** → Direct play decision
- **Seek Requests** → FFmpeg process management
- **Quality Selection** → Multi-bitrate transcoding
- **Buffer Management** → Transcoding speed optimization

---

## Performance Considerations

### Frontend Optimizations

- Use `limitRenditionByPlayerDimensions: true` to avoid unnecessary high-res transcoding
- Enable `useBandwidthFromLocalStorage: true` for better quality selection
- Implement buffer monitoring to detect transcoding bottlenecks

### Backend Optimizations

- **Segment Caching** - Keep recently transcoded segments
- **Concurrent Limits** - Limit simultaneous transcoding sessions
- **Quality Prioritization** - Transcode lower qualities first
- **Seek Debouncing** - Prevent rapid seek requests from overwhelming server

---

## Troubleshooting

### Common Issues

1. **Live Stream Behavior**

   - Ensure `#EXT-X-PLAYLIST-TYPE:VOD` in playlists
   - Set `enableLowInitialPlaylist: false` in Video.js config

2. **Seeking Not Working**

   - Verify `allowSeeksWithinUnsafeLiveWindow: true`
   - Check that `#EXT-X-ENDLIST` appears when transcoding is complete

3. **Quality Selector Not Appearing**

   - Ensure multiple quality streams in master playlist
   - Wait for `addqualitylevel` event before creating UI

4. **Buffer Starvation**
   - Monitor transcoding speed vs playback speed
   - Implement seek request debouncing
   - Add buffer health indicators

---

This configuration provides a seamless transcoded video experience that matches direct play behavior, with full seeking support and quality selection capabilities.
