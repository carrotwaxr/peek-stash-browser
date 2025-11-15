# Phase 3 & 4: Intelligent Quality Selection & Future Work

## Context

This document outlines the remaining work for the Smart Quality Selection feature after completing Phase 1 (Codec Detection) and Phase 2 (Smart Default Selection + Auto-Fallback).

**Session Context**: This was written at the end of a long session implementing Phase 2. The session is being closed due to performance, but all Phase 2 work is complete and ready to commit.

---

## ✅ Completed: Phase 1 - Codec Detection

**Backend**: Added `isStreamable` flag to scene metadata
- Detects if video codec is browser-compatible (H264/VP8/VP9/AV1)
- Implemented in stashapp-api v0.3.16
- Backend exposes flag via GraphQL

**Status**: Complete and working

---

## ✅ Completed: Phase 2 - Smart Default Selection + Auto-Fallback

### Smart Default Selection
- Frontend reads `isStreamable` flag from scene metadata
- If `isStreamable = true` → default to "direct" quality
- If `isStreamable = false` → default to "480p" transcode
- Implemented in [scenePlayerReducer.js:65-73](C:\Users\charl\code\peek-stash-browser\client\src\contexts\scenePlayerReducer.js)

### Auto-Fallback
- If direct play fails with codec error (codes 3 or 4), automatically fall back to 480p HLS
- Completely invisible to user (matches Stash UX)
- Uses Video.js native loading spinner
- Only indicator is quality dropdown changing to "480p"
- Implemented in [useVideoPlayer.js:238-302](C:\Users\charl\code\peek-stash-browser\client\src\components\video-player\useVideoPlayer.js)

**Key Implementation Details**:
- Uses ref instead of state to avoid re-renders (`isAutoFallbackRef`)
- Calls `player.play()` immediately after `player.load()` to prevent big play button
- Matches Stash's exact Video.js API usage pattern

**Status**: Complete and working perfectly

---

## 📋 Phase 3: Intelligent Quality Selection (NEXT)

### Overview
Currently, the quality dropdown always offers all preset qualities regardless of source resolution. This allows "upscaling" via transcoding (e.g., 720p source → 1080p transcode), which is wasteful and produces no quality improvement.

### Goals

1. **Dynamic Quality Options Based on Source Resolution**
   - Only offer transcode qualities ≤ source resolution
   - Always include "Direct Play" option
   - Example: 1080p source → Direct, 1080p, 720p, 480p, 360p
   - Example: 720p source → Direct, 720p, 480p, 360p (no 1080p)
   - Example: 480p source → Direct, 480p, 360p (no 720p, no 1080p)

2. **Intelligent Default Transcode Quality**
   - Currently hardcoded to 480p in auto-fallback
   - Should default to highest available quality ≤ source resolution
   - Example: 4K source with HEVC → auto-fallback to 1080p (not 480p)
   - Example: 1080p source with HEVC → auto-fallback to 1080p
   - Example: 720p source with HEVC → auto-fallback to 720p

3. **UI Updates**
   - Quality dropdown should only show relevant options
   - Possibly show source resolution in dropdown (e.g., "Direct (1080p)")
   - Consider disabling/hiding unavailable qualities vs. not showing them

### Implementation Plan

#### Backend Changes Needed
- Source resolution is already available in `scene.files[0].width` and `scene.files[0].height`
- No backend changes required (data already exposed)

#### Frontend Changes Needed

**1. Quality Preset Filtering** ([useVideoPlayer.js](C:\Users\charl\code\peek-stash-browser\client\src\components\video-player\useVideoPlayer.js))
```javascript
// Get source resolution
const sourceHeight = scene?.files?.[0]?.height || 1080;

// Filter quality presets to only those ≤ source resolution
const availableQualities = QUALITY_PRESETS.filter(preset => {
  if (preset.quality === "direct") return true;
  return preset.height <= sourceHeight;
});
```

**2. Smart Auto-Fallback Quality** ([useVideoPlayer.js:262-294](C:\Users\charl\code\peek-stash-browser\client\src\components\video-player\useVideoPlayer.js))
```javascript
// Instead of hardcoded 480p:
const hlsUrl = `/api/scene/${scene.id}/stream.m3u8?quality=480p`;

// Choose highest quality ≤ source resolution:
const sourceHeight = scene?.files?.[0]?.height || 1080;
const bestQuality = getBestTranscodeQuality(sourceHeight);
const hlsUrl = `/api/scene/${scene.id}/stream.m3u8?quality=${bestQuality}`;
```

**3. Helper Function**
```javascript
function getBestTranscodeQuality(sourceHeight: number): string {
  // Quality presets in descending order
  const presets = [
    { height: 2160, quality: "2160p" },
    { height: 1080, quality: "1080p" },
    { height: 720, quality: "720p" },
    { height: 480, quality: "480p" },
    { height: 360, quality: "360p" },
  ];

  // Find highest preset ≤ source resolution
  for (const preset of presets) {
    if (preset.height <= sourceHeight) {
      return preset.quality;
    }
  }

  // Fallback to lowest quality
  return "360p";
}
```

**4. Update Smart Default Selection** ([scenePlayerReducer.js:65-73](C:\Users\charl\code\peek-stash-browser\client\src\contexts\scenePlayerReducer.js))
```javascript
if (state.quality === "direct" && scene.isStreamable !== undefined) {
  if (scene.isStreamable) {
    autoSelectedQuality = "direct";
  } else {
    // Use intelligent quality selection instead of hardcoded 480p
    const sourceHeight = scene.files?.[0]?.height || 1080;
    autoSelectedQuality = getBestTranscodeQuality(sourceHeight);
  }
}
```

**5. Quality Dropdown UI** ([VideoPlayer.jsx or quality selector component](C:\Users\charl\code\peek-stash-browser\client\src\components\video-player\VideoPlayer.jsx))
- Filter available options based on source resolution
- Possibly show resolution in label: "Direct (1080p)", "720p", "480p"
- Consider showing why certain qualities are unavailable

### Quality Presets Reference
Current presets defined in [TranscodingManager.ts](C:\Users\charl\code\peek-stash-browser\server\services\TranscodingManager.ts):
- 2160p (4K): 3840x2160
- 1080p: 1920x1080
- 720p: 1280x720
- 480p: 854x480
- 360p: 640x360

### Testing Scenarios

1. **4K HEVC source**
   - Should offer: Direct, 2160p, 1080p, 720p, 480p, 360p
   - Auto-fallback should default to 2160p (not 480p)

2. **1080p HEVC source**
   - Should offer: Direct, 1080p, 720p, 480p, 360p
   - Should NOT offer: 2160p
   - Auto-fallback should default to 1080p

3. **720p H264 source (browser-compatible)**
   - Should offer: Direct, 720p, 480p, 360p
   - Should NOT offer: 1080p, 2160p
   - Should default to Direct (no auto-fallback)

4. **480p HEVC source**
   - Should offer: Direct, 480p, 360p
   - Should NOT offer: 720p, 1080p, 2160p
   - Auto-fallback should default to 480p

### Open Questions

1. Should we show source resolution in the "Direct" label?
   - "Direct Play (1080p)" vs. "Direct Play"

2. Should unavailable qualities be:
   - Hidden completely from dropdown?
   - Shown but disabled with tooltip?
   - Not shown at all (current approach seems best)

3. Should we add quality presets for:
   - 1440p (2560x1440) for intermediate resolution?
   - 240p for very low bandwidth?

4. Edge case: What if source resolution doesn't match a preset?
   - 900p source → should we offer 720p or 1080p?
   - Current approach: offer highest preset ≤ source height

---

## ❓ Phase 4: TBD

Phase 4 was not clearly defined in the original conversation. Possible candidates:

### Option A: Performance Optimizations
- Segment caching strategies
- Multi-quality transcoding (generate multiple qualities in parallel)
- Adaptive bitrate switching (true ABR like DASH)

### Option B: UI/UX Enhancements
- Show transcoding progress in UI
- Estimated time to buffer
- Quality auto-switching based on bandwidth
- Picture-in-picture support

### Option C: Advanced Features
- Resume playback position across devices
- Transcode queue management
- Bandwidth-aware quality selection
- Download original/transcoded file

### Option D: Manual Quality Switching Improvements
- Seamless quality switching (no position loss)
- Pre-buffer next quality level
- Smooth transitions between qualities

**Action Required**: Review and define Phase 4 scope before starting Phase 3.

---

## Current State (End of Phase 2)

### Files Modified in Phase 2

**Backend**:
- [video.ts](C:\Users\charl\code\peek-stash-browser\server\controllers\video.ts) - Stateless HLS endpoints
- [video.ts routes](C:\Users\charl\code\peek-stash-browser\server\routes\video.ts) - Segment routing
- [TranscodingManager.ts](C:\Users\charl\code\peek-stash-browser\server\services\TranscodingManager.ts) - Playlist generation

**Frontend**:
- [useVideoPlayer.js](C:\Users\charl\code\peek-stash-browser\client\src\components\video-player\useVideoPlayer.js) - Auto-fallback logic
- [scenePlayerReducer.js](C:\Users\charl\code\peek-stash-browser\client\src\contexts\scenePlayerReducer.js) - Smart default selection

### Key Learnings from Phase 2

1. **Match Stash's Patterns**: When in doubt, copy Stash's exact Video.js API usage
2. **Refs vs State**: Use refs for flags that shouldn't trigger re-renders
3. **Immediate play()**: Call `player.play()` immediately after `player.load()` to prevent UI flicker
4. **Stateless Architecture**: Simpler URL structure (`/scene/:id/stream.m3u8?quality=480p`)
5. **Segment Naming**: FFmpeg generates `segment_000.ts`, playlist references them directly

### Ready to Commit

All Phase 2 work is complete and tested. Ready to:
1. Review changes
2. Commit to feature branch
3. Push to GitHub
4. Start Phase 3 in fresh session

---

## Next Steps

1. **Immediate**: Commit and push Phase 2 work
2. **Next Session**: Implement Phase 3 - Intelligent Quality Selection
3. **Future**: Define and implement Phase 4

---

**Last Updated**: 2025-11-15
**Session**: Phase 2 completion
