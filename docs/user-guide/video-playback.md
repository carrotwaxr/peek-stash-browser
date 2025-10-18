# Video Playback

Peek provides smooth video playback with adaptive quality streaming, multiple playback speeds, and keyboard shortcuts for efficient navigation.

## Playing Videos

### Starting Playback

1. Browse to **Scenes** from the navigation menu
2. Click on any scene card to open the scene detail page
3. The video player will automatically load and start playing

!!! tip "Direct URLs"
    Scene detail pages support direct URLs, so you can bookmark or share specific scenes.

### Video Player Controls

The video player includes standard playback controls:

| Control | Function |
|---------|----------|
| **Play/Pause** | Start or pause video playback |
| **Progress Bar** | Seek to any position in the video |
| **Volume** | Adjust audio volume or mute |
| **Playback Speed** | Change playback speed (0.5x, 1x, 1.25x, 1.5x, 2x) |
| **Quality Selector** | Choose video quality (Auto, 720p, 480p, 360p) |
| **Fullscreen** | Toggle fullscreen mode |

## Quality Selection

Peek transcodes videos on-demand using FFmpeg to provide adaptive quality streaming.

### Available Qualities

| Quality | Resolution | Bitrate | Best For |
|---------|-----------|---------|----------|
| **720p** | 1280×720 | 2.5 Mbps | Local networks, wired connections |
| **480p** | 854×480 | 1.0 Mbps | WiFi, moderate bandwidth |
| **360p** | 640×360 | 500 Kbps | Mobile devices, low bandwidth |
| **Auto** | Adaptive | Varies | Let Peek choose based on bandwidth |

### Changing Quality

1. Click the **Quality** button in the player controls
2. Select your preferred quality from the dropdown
3. The player will switch seamlessly

!!! info "Quality vs Performance"
    Higher quality requires more bandwidth and CPU for transcoding. If playback is stuttering, try a lower quality.

## Playback Speed

Adjust playback speed for faster or slower viewing:

1. Click the **Speed** button (default shows "1x")
2. Choose from: **0.5x**, **1x**, **1.25x**, **1.5x**, **2x**
3. Audio pitch is preserved at all speeds

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** or **K** | Play/Pause |
| **←** | Seek backward 5 seconds |
| **→** | Seek forward 5 seconds |
| **J** | Seek backward 10 seconds |
| **L** | Seek forward 10 seconds |
| **↑** | Increase volume |
| **↓** | Decrease volume |
| **M** | Mute/Unmute |
| **F** | Toggle fullscreen |
| **0-9** | Seek to 0%-90% of video |
| **Home** | Seek to beginning |
| **End** | Seek to end |

!!! tip "Power User Shortcuts"
    Use **J** and **L** for quick 10-second jumps, or **0-9** number keys to jump to specific percentages.

## Seeking

### Timeline Seeking

- **Click** on the progress bar to jump to that position
- **Hover** over the progress bar to see a preview thumbnail (if available)
- **Drag** the playhead to scrub through the video

### Smart Seeking

Peek uses intelligent session management for efficient seeking:

- **Nearby seeks** (< 30 seconds): Reuses the current transcoding session
- **Far seeks** (> 30 seconds): Creates a new session starting from the new position
- **Already transcoded segments** are preserved for instant playback

## Fullscreen Mode

### Entering Fullscreen

- Click the **Fullscreen** button in the player controls
- Press **F** on your keyboard
- Double-click the video (if enabled)

### Exiting Fullscreen

- Click the **Exit Fullscreen** button
- Press **F** or **Esc** on your keyboard

!!! warning "Browser Permissions"
    Some browsers may prompt for permission to enter fullscreen. Allow it for the best experience.

## Video Information

Scene detail pages display comprehensive video information:

### Scene Metadata

- **Title**: Scene title from Stash
- **Date**: Recording or release date
- **Duration**: Total video length
- **Rating**: Star rating (if set)
- **Studio**: Production studio
- **Performers**: Cast members with links to their pages
- **Tags**: Categories and descriptive tags

### File Information

- **Resolution**: Original video resolution
- **File Size**: Original file size
- **Codec**: Video and audio codecs
- **Bitrate**: Original bitrate

## Troubleshooting

### Video Won't Play

**Symptoms**: Player shows loading spinner indefinitely or displays error

**Solutions**:

1. **Check FFmpeg**: Ensure FFmpeg is installed on the server
   ```bash
   docker exec peek-stash-browser ffmpeg -version
   ```

2. **Check file permissions**: Verify media directory is readable
   ```bash
   docker exec peek-stash-browser ls -la /app/media
   ```

3. **Check backend logs**: Look for transcoding errors
   ```bash
   docker logs peek-stash-browser
   ```

4. **Verify path mapping**: Ensure `STASH_INTERNAL_PATH` and `STASH_MEDIA_PATH` are configured correctly

### Buffering or Stuttering

**Symptoms**: Video pauses frequently to buffer or plays choppy

**Possible Causes & Solutions**:

1. **Network bandwidth**: Reduce quality to 480p or 360p
2. **Server CPU**: Check CPU usage during transcoding
3. **Slow storage**: Media on network share (SMB/NFS) is slower than local storage
4. **Too many simultaneous streams**: Each stream requires CPU for transcoding

!!! tip "Performance Tip"
    For best performance, store media on local SSD storage and allocate sufficient CPU resources to the container.

### Seeking Is Slow

**Symptoms**: Seeking takes a long time to start playing from new position

**Possible Causes**:

1. **Large seek distance**: Seeking far ahead requires new transcoding session
2. **I/O performance**: Check storage read speed
3. **CPU bottleneck**: Transcoding can't keep up

**Solutions**:

- Wait for initial buffering to complete before seeking
- Use lower quality for faster transcoding startup
- Ensure media is on fast local storage

### Audio Out of Sync

**Symptoms**: Audio plays ahead or behind video

**Solutions**:

1. Refresh the page and restart playback
2. Try a different quality level
3. Check if issue exists in original file

If problem persists, report on GitHub Issues with:
- Scene ID
- Video codec/container format
- Browser and version

### Quality Switching Doesn't Work

**Symptoms**: Selecting different quality has no effect

**Solutions**:

1. Check browser console for errors (F12 → Console tab)
2. Verify multiple qualities are being transcoded:
   ```bash
   docker exec peek-stash-browser ls -la /app/data/hls-cache/<session-id>/
   ```
3. Check backend logs for FFmpeg errors

## Advanced Features

### Direct Play vs Transcoding

Peek always transcodes videos to HLS format for:

- **Adaptive quality**: Switch quality on-the-fly
- **Universal compatibility**: Works in all modern browsers
- **Seeking efficiency**: Fast seeking with HLS segments
- **Bandwidth adaptation**: Auto quality based on network conditions

!!! info "Future Feature: Direct Play"
    Direct play (serving original file without transcoding) is planned for supported formats when quality switching isn't needed.

### Picture-in-Picture (PiP)

Some browsers support Picture-in-Picture mode:

1. Right-click the video
2. Select "Picture in Picture" (browser-dependent)
3. Video floats in a small window while you browse other tabs

### Casting

Browser casting to Chromecast or AirPlay may work but is not officially supported. Transcoded HLS streams can typically be cast like any other web video.

## Next Steps

- [Playlists](playlists.md) - Create and manage video playlists
- [Search & Browse](search-browse.md) - Find content quickly
- [Troubleshooting](../reference/troubleshooting.md) - More troubleshooting tips
