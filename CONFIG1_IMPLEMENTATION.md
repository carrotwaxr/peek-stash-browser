# Configuration 1: Continuous HLS Stream - Implementation Summary

## Implementation Complete ✅

**Date**: 2025-10-16

## Changes Made

### Backend Changes

1. **TranscodingManager.ts** - Completely rewritten (~400 lines vs 1139 lines)
   - Removed: All on-demand segment transcoding logic
   - Removed: Background transcoding workers
   - Removed: Read-ahead buffering
   - Removed: Pre-generation of complete VOD playlists
   - Added: Single continuous FFmpeg process per session
   - Added: Enhanced logging with `[TranscodingManager]` and `[FFmpeg]` prefixes
   - Simplified: Session management (one process per session)

2. **video.ts controller**
   - Removed: On-demand segment transcoding trigger
   - Simplified: Segment serving now just waits for FFmpeg to generate segments
   - Added: Better logging with `[SegmentServing]` prefix
   - Increased: Wait timeout to 15 seconds for slower transcoding

### Frontend Changes

1. **videoPlayerLogging.js** - New file
   - Added: Comprehensive Video.js event logging
   - Added: Buffer range tracking
   - Added: Network request logging (XHR proxy)
   - Added: VHS-specific logging
   - Added: Initial setup logging

2. **VideoPlayer.jsx**
   - Added: Import and setup of logging utilities
   - Added: Network logging initialization on mount
   - Added: Initial setup logging before playback starts

### Files Backed Up

- `server/services/TranscodingManager_old.ts` - Original implementation for reference

## Key Implementation Details

### FFmpeg Command

```bash
ffmpeg \
  -ss ${startTime} \                     # Seek to start position
  -i ${inputFile} \                      # Input file
  -c:v libx264 \                         # H.264 video codec
  -preset veryfast \                     # Encoding speed
  -crf 23 \                              # Constant quality
  -profile:v main \                      # H.264 profile
  -level 4.0 \                           # H.264 level
  -g 48 \                                # GOP size (keyframe every 2s at 24fps)
  -keyint_min 48 \
  -sc_threshold 0 \                      # Disable scene change detection
  -pix_fmt yuv420p \
  -movflags +faststart \
  -vf scale=854:480 \                    # 480p resolution
  -c:a aac \                             # AAC audio codec
  -b:a 128k \                            # Audio bitrate
  -ar 48000 \                            # Audio sample rate
  -ac 2 \                                # Stereo
  -f hls \                               # HLS output format
  -hls_time 4 \                          # 4-second segments
  -hls_list_size 0 \                     # Keep all segments (VOD)
  -hls_segment_filename ${dir}/segment_%03d.ts \
  -hls_playlist_type vod \
  -hls_flags independent_segments \      # Each segment independently decodable
  -start_number ${startSegment} \        # Start numbering from seek position
  ${dir}/stream.m3u8
```

### How It Works

1. **Playback Start**:
   - User clicks play
   - Frontend calls `/api/video/play?sceneId=X&direct=false`
   - Backend creates transcoding session
   - Single FFmpeg process starts, generating segments continuously
   - Frontend receives session ID and playlist URL
   - Video.js starts loading playlist

2. **Segment Serving**:
   - Video.js requests segment (e.g., `segment_000.ts`)
   - If segment doesn't exist yet, server waits up to 15 seconds
   - Once FFmpeg generates segment, it's served immediately
   - Process continues for all segments

3. **Seeking**:
   - User seeks to new position
   - Backend kills old FFmpeg process
   - New session created with new start time
   - New FFmpeg process starts from seek position
   - `-start_number` ensures segment numbering matches seek position

### Expected Behavior

- ✅ **Timestamps should be sequential**: FFmpeg manages entire stream, so timestamps should naturally be 0-4s, 4-8s, etc.
- ✅ **No per-segment issues**: One continuous process eliminates timestamp reset problems
- ✅ **Smooth seeking**: New process starts from exact seek position
- ⚠️ **Slower start**: Must wait for first segment to generate (but only ~4 seconds)
- ⚠️ **Higher server load**: One FFmpeg process per active playback

## Testing Instructions

1. **Start the application**:
   ```bash
   docker-compose up
   ```

2. **Navigate to test video**:
   - Scene ID: 6969 ("Grandpa's Muscle Memory")
   - 41 minutes, 1080p H.264/AAC source

3. **Select transcode mode**:
   - Choose "Force Transcode" from playback mode selector
   - Click play

4. **Observe behavior**:
   - Does video play beyond first 10-20 seconds?
   - Does buffer continuously increase?
   - Are there any stalls or stutters?

5. **Export console logs**:
   - Open browser DevTools → Console
   - Right-click → Save as → `console-export-YYYY-MM-DD-HH-MM-SS.txt`
   - Place in project root

6. **Collect server logs**:
   ```bash
   docker logs peek-server --tail 500 --timestamps > server-logs-config1.txt
   ```

## Expected Log Output

### Backend (Server)
```
[TranscodingManager] Created session 6969_0_1729123456789 at startTime 0s
[TranscodingManager] Starting continuous HLS transcode for session 6969_0_1729123456789
[TranscodingManager] Input: /app/media/Not My Grandpa/...
[TranscodingManager] Output: /app/data/segments/6969_0_1729123456789/480p
[TranscodingManager] Video duration: 2470.03s, Starting from segment 0
[TranscodingManager] FFmpeg command: ffmpeg -ss 0 -i ...
[FFmpeg] 6969_0_1729123456789: Started output
[FFmpeg Progress] 6969_0_1729123456789: time=00:00:08.00 speed=0.8x fps=24
[TranscodingManager] First segment ready after 4200ms
[TranscodingManager] Session 6969_0_1729123456789 active
```

### Frontend (Browser Console)
```
================================================================================
[PLAYBACK INIT] Starting new playback session
================================================================================
[PLAYBACK INIT] Scene: {id: "6969", title: "Grandpa's Muscle Memory", duration: 2470.03, ...}
[PLAYBACK INIT] Compatibility: {canDirectPlay: false, reason: "..."}
[PLAYBACK INIT] Playback mode: transcode
================================================================================
[Network] Loading: http://localhost:8080/api/video/playlist/6969_0_1729123456789/master.m3u8
[Network] Loaded: {url: "...", status: 200, duration: "45ms", ...}
[VideoJS] Setting up enhanced logging
[VideoJS] Loaded metadata: {duration: 2470.03, currentTime: 0, ...}
[VideoJS] Buffer progress: {ranges: [{start: "0.00", end: "8.00"}], currentTime: "0.00"}
[VideoJS] Playing started
[VideoJS] Timeupdate: {currentTime: "2.00", bufferEnd: "12.00", bufferAhead: "10.00"}
[VideoJS] Timeupdate: {currentTime: "4.00", bufferEnd: "16.00", bufferAhead: "12.00"}
```

## Success Criteria

- ✅ Video plays beyond first 10-20 seconds
- ✅ Buffer ranges continuously increase
- ✅ No "buffer did not increase" errors
- ✅ Seeking works (may take a few seconds to restart)
- ✅ Transcoding speed ≥ 0.8x (acceptable for testing)

## Next Steps After Testing

1. Analyze console logs for timestamp information
2. Check buffer behavior over time
3. Verify segments have sequential timestamps
4. Document results in `TRANSCODING_TEST_RESULTS.md`
5. If successful: Test with seeking and different videos
6. If unsuccessful: Move to Configuration 2

## Notes

- **480p only**: Simplified to single quality for testing
- **Logging is verbose**: This is intentional for debugging
- **Server logs**: Check for FFmpeg encoding speed (should be close to 1.0x for smooth playback)
- **Buffer target**: Currently 6 seconds minimum (see `videoPlayerUtils.js`)
