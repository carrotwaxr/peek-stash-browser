# FFmpeg HLS Transcoding Configuration Test Results

## Test Environment

**Date**: 2025-10-16

**Test Video**: "Grandpa's Muscle Memory"
- **ID**: 6969
- **Duration**: 2470.03s (~41 minutes)
- **Resolution**: 1920x1080 (1080p source)
- **Codec**: H.264 / AAC
- **Bitrate**: 12.1 Mbps
- **Frame Rate**: 29.97 fps
- **File Size**: 3.5 GB
- **File Path**: `/data/Not My Grandpa/Not My Grandpa (2020-09-15) Grandpa's Muscle Memory - Kenna James Evan Stone [1080p].mp4`

**FFmpeg Version**: (TBD - will check in container)

**Video.js Version**: (TBD - will check package.json)

**Target Quality**: 480p (854x480, 1400k video, 128k audio)

**Segment Duration**: 4 seconds

---

## Configuration Test Results

| Config # | Name | Playback Success | Buffer Behavior | Timestamp Issues | Transcode Speed | Notes |
|----------|------|------------------|-----------------|------------------|-----------------|-------|
| 1 | Continuous HLS Stream | ⏳ Pending | - | - | - | - |
| 2 | HLS Muxer Individual | ⏳ Pending | - | - | - | - |
| 3 | fMP4 Format | ⏳ Pending | - | - | - | - |
| 4 | Alternative Presets | ⏳ Pending | - | - | - | - |

---

## Detailed Analysis

### Configuration 1: Continuous HLS Stream

**Status**: ⏳ Not yet tested

**Implementation**: One continuous FFmpeg process generating HLS segments

**Theory**: FFmpeg manages entire stream as continuous encode, eliminating per-segment timestamp issues

**Timestamp Analysis**: (Pending test results)

**Buffer Analysis**: (Pending test results)

**Errors**: (Pending test results)

**Conclusion**: (Pending test results)

---

### Configuration 2: HLS Muxer with Individual Segments

**Status**: ⏳ Not yet tested

**Implementation**: Use FFmpeg's HLS muxer (not segment muxer) for individual segments

**Theory**: HLS muxer has better built-in handling for HLS-specific requirements

**Timestamp Analysis**: (Pending test results)

**Buffer Analysis**: (Pending test results)

**Errors**: (Pending test results)

**Conclusion**: (Pending test results)

---

### Configuration 3: Fragmented MP4 (fMP4) Format

**Status**: ⏳ Not yet tested

**Implementation**: Use fMP4 segments instead of MPEG-TS

**Theory**: fMP4 has better native browser support and timestamp handling

**Timestamp Analysis**: (Pending test results)

**Buffer Analysis**: (Pending test results)

**Errors**: (Pending test results)

**Conclusion**: (Pending test results)

---

### Configuration 4: Alternative Preset Testing

**Status**: ⏳ Not yet tested

**Implementation**: Test different x264 presets (faster, fast, medium)

**Theory**: Some presets may have better timestamp handling

**Timestamp Analysis**: (Pending test results)

**Buffer Analysis**: (Pending test results)

**Errors**: (Pending test results)

**Conclusion**: (Pending test results)

---

## Final Recommendation

(To be filled after all tests complete)

---

## Implementation Notes

(Notes about implementing the winning configuration)
