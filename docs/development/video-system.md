# Video System Architecture

This document provides comprehensive details about Peek's video transcoding and streaming system, including FFmpeg integration, HLS streaming, and Video.js configuration.

## Overview

Peek uses a session-based transcoding system powered by FFmpeg to deliver adaptive HLS (HTTP Live Streaming) video with multiple quality levels. Videos are transcoded on-demand when users play them, with intelligent session management for seeking and quality switching.

## Transcoding Manager

The `TranscodingManager` service (`server/src/services/TranscodingManager.ts`) is the core of the video system, managing FFmpeg processes and HLS session lifecycle.

### Session Architecture

Each video playback session is represented by a unique session object:

```typescript
interface TranscodingSession {
  sessionId: string;        // Unique identifier (UUID)
  sceneId: string;          // Source video ID from Stash
  startTime: number;        // Seek position in seconds
  userId: string;           // User who initiated session
  status: SessionStatus;    // Current session status
  qualities: string[];      // Available quality levels ['720p', '480p', '360p']
  processes: Map<string, ChildProcess>;  // FFmpeg processes per quality
  lastAccess: Date;         // For cleanup tracking
  outputDir: string;        // Temporary file directory
  scene?: Scene;            // Cached scene metadata from Stash
}

type SessionStatus = 'starting' | 'active' | 'completed' | 'error';
```

### Quality Presets

Peek offers three quality levels with optimized encoding parameters:

```typescript
const QUALITY_PRESETS = {
  '720p': {
    video: {
      resolution: '1280:720',
      bitrate: '2500k',
      maxrate: '2800k',
      bufsize: '5000k'
    },
    audio: {
      bitrate: '128k',
      sampleRate: '48000'
    }
  },
  '480p': {
    video: {
      resolution: '854:480',
      bitrate: '1000k',
      maxrate: '1200k',
      bufsize: '2000k'
    },
    audio: {
      bitrate: '96k',
      sampleRate: '44100'
    }
  },
  '360p': {
    video: {
      resolution: '640:360',
      bitrate: '500k',
      maxrate: '600k',
      bufsize: '1000k'
    },
    audio: {
      bitrate: '64k',
      sampleRate: '44100'
    }
  }
};
```

## FFmpeg Integration

### HLS Generation Command

Peek uses FFmpeg to generate HLS playlists and segments with adaptive quality:

```bash
ffmpeg -ss ${startTime} -i "${inputFile}" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -strict experimental \
  -f hls \
  -hls_time 4 \
  -hls_list_size 0 \
  -hls_segment_type mpegts \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -hls_segment_filename "${outputDir}/stream_%v/segment_%03d.ts" \
  "${outputDir}/stream_%v/playlist.m3u8"
```

**Key FFmpeg Options**:

| Option | Purpose |
|--------|---------|
| `-ss ${startTime}` | Seek to start position (before input for efficiency) |
| `-i "${inputFile}"` | Input video file |
| `-c:v libx264` | H.264 video codec |
| `-preset fast` | Encoding speed/quality tradeoff |
| `-crf 23` | Constant Rate Factor (quality level, lower = better) |
| `-c:a aac` | AAC audio codec |
| `-f hls` | HLS output format |
| `-hls_time 4` | 4-second segment duration |
| `-hls_list_size 0` | Keep all segments in playlist (VOD mode) |
| `-master_pl_name` | Master playlist filename |
| `-var_stream_map` | Map video/audio streams to quality variants |
| `-hls_segment_filename` | Template for segment files |

### Encoding Parameters

**Video Encoding**:
- **Codec**: H.264 (libx264) for broad compatibility
- **Preset**: `fast` balances encoding speed and quality
- **CRF**: 23 (good quality, reasonable file size)
- **Keyframe interval**: Every 2 seconds for seekability

**Audio Encoding**:
- **Codec**: AAC for compatibility
- **Bitrate**: 128k (720p), 96k (480p), 64k (360p)
- **Sample rate**: 48kHz (720p), 44.1kHz (480p/360p)

**HLS Settings**:
- **Segment duration**: 4 seconds (balance between latency and efficiency)
- **Playlist type**: VOD (complete playlist with all segments)
- **Segment format**: MPEG-TS for compatibility

## Session Lifecycle

### 1. Session Creation

When a user requests video playback:

```typescript
const session = await transcodingManager.createSession({
  sceneId: '12345',
  userId: 'user-uuid',
  startTime: 120,  // Start at 2 minutes
  qualities: ['720p', '480p', '360p']
});

// Returns:
{
  sessionId: 'session-uuid',
  masterPlaylistUrl: '/api/video/session/session-uuid/master.m3u8'
}
```

### 2. FFmpeg Process Startup

For each quality level, Peek spawns an FFmpeg process:

```typescript
const ffmpegProcess = spawn('ffmpeg', [
  '-ss', startTime.toString(),
  '-i', videoPath,
  // ... encoding parameters
  '-hls_segment_filename', `${outputDir}/${quality}/segment_%03d.ts`,
  `${outputDir}/${quality}/playlist.m3u8`
]);

// Monitor process output
ffmpegProcess.stderr.on('data', (data) => {
  logger.debug('FFmpeg output', { sessionId, quality, data: data.toString() });
});

ffmpegProcess.on('exit', (code) => {
  if (code === 0) {
    session.status = 'completed';
  } else {
    session.status = 'error';
    logger.error('FFmpeg process failed', { sessionId, quality, exitCode: code });
  }
});
```

### 3. HLS Playlist Serving

**Master Playlist** (`/api/video/session/:sessionId/master.m3u8`):

```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
stream_0/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
stream_1/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
stream_2/playlist.m3u8
```

**Quality Playlist** (`/api/video/session/:sessionId/720p/playlist.m3u8`):

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:4.000000,
segment_000.ts
#EXTINF:4.000000,
segment_001.ts
#EXTINF:4.000000,
segment_002.ts
# ... continues for all segments
#EXT-X-ENDLIST
```

### 4. Segment Delivery

Video segments are served as they're generated by FFmpeg:

```typescript
app.get('/api/video/session/:sessionId/:quality/segment_:num.ts', (req, res) => {
  const { sessionId, quality, num } = req.params;
  const session = transcodingManager.getSession(sessionId);

  if (!session) {
    return res.status(404).send('Session not found');
  }

  const segmentPath = path.join(
    session.outputDir,
    quality,
    `segment_${num.padStart(3, '0')}.ts`
  );

  // Wait for segment to be generated if not ready
  await waitForSegment(segmentPath);

  res.sendFile(segmentPath);
});
```

### 5. Session Cleanup

Sessions are automatically cleaned up after inactivity:

```typescript
const CLEANUP_INTERVAL = 30 * 60 * 1000;  // 30 minutes

setInterval(() => {
  const now = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    const inactiveTime = now - session.lastAccess.getTime();

    if (inactiveTime > CLEANUP_INTERVAL) {
      // Kill FFmpeg processes
      for (const process of session.processes.values()) {
        process.kill('SIGTERM');
      }

      // Delete temporary files
      fs.rmSync(session.outputDir, { recursive: true, force: true });

      // Remove session
      sessions.delete(sessionId);

      logger.info('Session cleaned up', { sessionId, inactiveTime });
    }
  }
}, 5 * 60 * 1000);  // Check every 5 minutes
```

## Seeking and Session Reuse

### Smart Seeking Strategy

When a user seeks within a video, Peek decides whether to:
1. **Reuse existing session** (if seeking nearby)
2. **Restart FFmpeg** (if seeking far away)

```typescript
const SEEK_THRESHOLD = 30;  // seconds

async function handleSeek(sessionId: string, newTime: number) {
  const session = getSession(sessionId);
  const timeDiff = Math.abs(newTime - session.startTime);

  if (timeDiff < SEEK_THRESHOLD) {
    // Seeking nearby - keep existing session
    // Video.js will navigate to correct segment
    return { sessionId, reused: true };
  } else {
    // Seeking far - create new session from new position
    return await createSession({
      sceneId: session.sceneId,
      userId: session.userId,
      startTime: newTime,
      qualities: session.qualities
    });
  }
}
```

### Segment Preservation

When restarting a session from a new position, already-transcoded segments are preserved:

```typescript
async function restartSession(session: TranscodingSession, newStartTime: number) {
  // Kill existing FFmpeg processes
  for (const process of session.processes.values()) {
    process.kill('SIGTERM');
  }

  // Keep existing output directory with transcoded segments
  const preservedDir = session.outputDir;

  // Start new FFmpeg from new position
  // Segments will be created with new numbering
  // Old segments remain available for seeking back

  session.startTime = newStartTime;
  session.status = 'starting';

  await startFFmpegProcesses(session);
}
```

## Video.js Configuration

### Player Setup

Peek uses Video.js 8 with custom configuration for optimal HLS playback:

```javascript
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

const videoJsOptions = {
  autoplay: true,
  controls: true,
  responsive: true,
  fluid: true,
  playbackRates: [0.5, 1, 1.25, 1.5, 2],

  html5: {
    vhs: {
      // Force VHS for all browsers except Safari
      overrideNative: !videojs.browser.IS_SAFARI,

      // VOD-specific settings
      enableLowInitialPlaylist: false,  // Don't treat as live
      smoothQualityChange: true,        // Smooth quality switching
      useBandwidthFromLocalStorage: true,
      limitRenditionByPlayerDimensions: true,
      allowSeeksWithinUnsafeLiveWindow: true,
      handlePartialData: true,

      // Bandwidth estimation
      bandwidth: 4194304,  // 4 Mbps initial estimate
      enableLowInitialPlaylist: false
    },

    // Disable native tracks for consistent behavior
    nativeAudioTracks: false,
    nativeVideoTracks: false
  },

  plugins: {
    qualityLevels: {}  // Enable quality level selection
  }
};

const player = videojs('video-player', videoJsOptions);
```

### Loading HLS Source

```javascript
player.src({
  src: `/api/video/session/${sessionId}/master.m3u8`,
  type: 'application/x-mpegURL'
});

// Wait for source to load
player.ready(() => {
  player.play();
});
```

### Quality Selector

Custom quality selector UI for user-controlled quality switching:

```javascript
const qualityLevels = player.qualityLevels();

qualityLevels.on('addqualitylevel', (event) => {
  const quality = event.qualityLevel;

  // Add quality option to UI
  addQualityOption({
    height: quality.height,
    bitrate: quality.bitrate,
    enabled: quality.enabled
  });
});

function setQuality(height) {
  for (let i = 0; i < qualityLevels.length; i++) {
    const level = qualityLevels[i];

    if (height === 'auto') {
      level.enabled = true;  // Enable all for auto
    } else {
      level.enabled = (level.height === height);
    }
  }
}
```

### Event Handling

```javascript
// Track playback progress
player.on('timeupdate', () => {
  const currentTime = player.currentTime();
  updateProgressBar(currentTime);
});

// Handle seeking
player.on('seeking', () => {
  const seekTime = player.currentTime();
  logger.debug('User seeking', { seekTime });
});

// Handle quality changes
qualityLevels.on('change', () => {
  const currentQuality = qualityLevels[qualityLevels.selectedIndex];
  logger.info('Quality changed', {
    height: currentQuality.height,
    bitrate: currentQuality.bitrate
  });
});

// Handle errors
player.on('error', (error) => {
  logger.error('Video playback error', {
    code: error.code,
    message: error.message
  });

  showErrorMessage('Video playback failed. Please try again.');
});
```

## Path Translation

Peek translates paths between Stash's internal Docker paths and Peek's mount points:

```typescript
import { translateStashPath } from './utils/pathMapping';

// Stash reports: /data/scenes/video.mp4
// Peek mounts media at: /app/media

const stashPath = scene.files[0].path;  // "/data/scenes/video.mp4"
const peekPath = translateStashPath(stashPath);  // "/app/media/scenes/video.mp4"

// Start transcoding with translated path
await transcodingManager.createSession({
  inputPath: peekPath,
  // ... other options
});
```

**Configuration**:
- `STASH_INTERNAL_PATH`: Path prefix Stash uses internally (default: `/data`)
- `STASH_MEDIA_PATH`: Where Peek accesses Stash's media (default: `/app/media`)

## Performance Optimization

### Encoding Performance

**Fast Preset**: Balances speed and quality
- Suitable for real-time transcoding
- 0.8x - 2.0x encoding speed on typical hardware

**Seeking Optimization**: `-ss` before `-i` for fast seeking
- FFmpeg seeks in input file before decoding
- Much faster than decoding then seeking

**Segment Duration**: 4 seconds
- Good balance between latency and efficiency
- Smaller segments = more overhead, lower latency
- Larger segments = less overhead, higher latency

### Network Performance

**Adaptive Bitrate**: Video.js automatically selects quality based on bandwidth

**Quality Presets**:
- 720p @ 2.5 Mbps: Good for local networks, wired connections
- 480p @ 1.0 Mbps: Good for WiFi, moderate bandwidth
- 360p @ 500 Kbps: Good for mobile, low bandwidth

**Segment Buffering**: Video.js buffers 2-3 segments ahead

### Storage Considerations

**Temporary Storage**:
- Each session creates temporary files in `CONFIG_DIR/hls-cache`
- Storage usage: ~50-100 MB per quality per minute of video
- Automatic cleanup after 30 minutes of inactivity

**Recommendations**:
- Use SSD for temporary storage (faster I/O)
- Allocate 5-10 GB for `CONFIG_DIR` on busy servers
- Monitor disk usage with cleanup scripts

## Troubleshooting

### Common Issues

**Video Won't Play**:
1. Check FFmpeg is installed: `ffmpeg -version`
2. Verify path mapping is correct (check logs for translated paths)
3. Check file permissions on media directory
4. Review FFmpeg errors in backend logs

**Slow Transcoding**:
1. Check CPU usage (FFmpeg is CPU-intensive)
2. Verify media is on local storage (not network share)
3. Consider reducing quality presets
4. Check I/O performance with `dd if=/app/media/file.mp4 of=/dev/null`

**Seeking Issues**:
1. Check segment generation (are segments being created?)
2. Verify playlist is updated (check playlist.m3u8 content)
3. Review Video.js console logs for seeking errors
4. Check session is still active (not cleaned up)

**Quality Switching Issues**:
1. Verify all quality playlists are being generated
2. Check Video.js quality levels are being detected
3. Review network bandwidth estimation
4. Test with `setQuality()` function manually

### Debug Logging

Enable detailed logging for video system debugging:

```typescript
// Backend (server/utils/logger.ts)
logger.level = 'debug';

// Frontend (Video.js)
videojs.log.level('debug');
```

**Useful Log Messages**:
- `Session created`: New transcoding session started
- `FFmpeg started`: FFmpeg process spawned for quality
- `Segment completed`: HLS segment finished encoding
- `Session cleaned up`: Inactive session removed
- `Quality changed`: User switched quality level

## Next Steps

- [API Reference](api-reference.md) - Video streaming endpoints
- [Testing Guide](testing.md) - Testing video functionality
- [Performance Tips](../reference/performance.md) - Optimization strategies
