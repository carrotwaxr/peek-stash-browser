# Beta Testing Guide

Thank you for helping test Peek! Your feedback is crucial for making this software stable and user-friendly.

## ⚠️ Important Notes

- **This is beta software** - Expect bugs, crashes, and incomplete features
- **Back up your Stash database** before connecting Peek (Peek shouldn't modify Stash, but better safe than sorry)
- **Don't use in production** environments yet

## Getting Started

### 1. Installation

Follow the [Installation Guide](getting-started/installation.md) to set up Peek with Docker or unRAID.

### 2. First Login

**Default Credentials:**
- Username: `admin`
- Password: `admin`

**⚠️ Change your password immediately** via Settings > User Management

### 3. Verify Connection

After logging in, you should see content from your Stash library:
- Scenes on the home page
- Performers, Studios, and Tags in the sidebar

If you don't see content, check the [Troubleshooting Guide](reference/troubleshooting.md).

## Core Testing Scenarios

Please test these core functions and report any issues:

### Video Playback

**Test Direct Play:**
1. Click any scene card
2. Video player should load
3. Click play - video should start immediately
4. Verify controls work (play/pause, seek, volume)

**Test Transcoding:**
1. Open a scene with an unusual codec or high bitrate
2. Click the quality selector (gear icon)
3. Select "720p", "480p", or "360p"
4. Video should start transcoding and playing within 10-15 seconds

**Expected Issues:**
- Some videos may not transcode (codec incompatibility)
- Seeking during transcoding may be slow
- Quality switching may cause buffering

**Report if:**
- Video never starts playing
- Player freezes or crashes
- Audio/video desync
- Severe buffering on local network

### Watch History

**Test Progress Tracking:**
1. Start playing a scene
2. Watch for 30+ seconds
3. Seek to a different timestamp
4. Close the video
5. Reopen the same scene - it should offer to resume

**Test History View:**
1. Navigate to Watch History (sidebar)
2. Verify recently watched scenes appear
3. Check resume times are accurate
4. Test filtering (All / In Progress)

**Report if:**
- Progress doesn't save
- Resume times are incorrect
- History doesn't update

### Playlists

**Test Playlist Creation:**
1. Go to Playlists (sidebar) > Create Playlist
2. Enter a name and create
3. Browse scenes and click "+ Playlist" button on scene cards
4. Add multiple scenes to your playlist

**Test Playlist Playback:**
1. Open your playlist
2. Click "Play All"
3. Video should start with playlist controls visible
4. Test Next/Previous buttons
5. Test shuffle and repeat modes

**Report if:**
- Can't create playlists
- Can't add scenes to playlists
- Playlist playback doesn't work
- Next/Previous skips incorrectly

### Search & Filtering

**Test Scene Search:**
1. Go to Scenes page
2. Enter a search term
3. Results should filter instantly
4. Try sorting (date, rating, duration, etc.)
5. Try pagination

**Test Performer/Studio/Tag Browsing:**
1. Navigate to Performers, Studios, or Tags
2. Verify cards load with images/metadata
3. Click a card to view details
4. Verify related scenes appear

**Report if:**
- Search doesn't work
- Sorting breaks pagination
- Cards don't load
- Detail pages show errors

### Keyboard Navigation (TV Mode)

**Test with Keyboard:**
1. Use arrow keys to navigate scene grid
2. Press Enter to open a scene
3. Use arrow keys in video player for seeking
4. Test keyboard shortcuts (Space = play/pause, F = fullscreen)

**Report if:**
- Arrow keys don't navigate cards
- Enter doesn't work
- Video player controls don't respond to keyboard
- Focus indicator missing or broken

## Reporting Bugs

When you find a bug, please [open a GitHub issue](https://github.com/carrotwaxr/peek-stash-browser/issues/new) with:

### Required Information

1. **Title**: Short, descriptive summary (e.g., "Video won't play after seeking")
2. **Description**: What happened vs. what you expected
3. **Steps to Reproduce**:
   ```
   1. Click scene "Example Scene"
   2. Start playback
   3. Seek to 5:00
   4. Video stops and shows error
   ```
4. **Environment**:
   - Peek version (e.g., `v0.1.0-beta`)
   - Docker or unRAID
   - Browser (Chrome, Firefox, Safari, etc.)
   - Device (Desktop, tablet, TV)

### Helpful Extras

- **Screenshots** or screen recordings
- **Browser console errors** (F12 > Console tab)
- **Docker logs**: `docker logs peek-stash-browser`
- **Network info**: Local vs. remote access

### Example Bug Report

```markdown
**Title:** Video freezes when switching quality during playback

**Description:**
When I change quality from Direct to 720p while the video is playing,
the player freezes and shows a black screen. Audio continues playing.

**Steps to Reproduce:**
1. Start playing any scene in Direct mode
2. Let it play for 10+ seconds
3. Click quality selector > 720p
4. Player freezes with black screen

**Environment:**
- Peek v0.1.0-beta
- unRAID Docker
- Chrome 120 on Windows 11
- Local network (gigabit ethernet)

**Console Errors:**
`Failed to load segment: 404 Not Found`

**Screenshot:** [attached]
```

## Requesting Features

Have an idea for a new feature? [Open an issue](https://github.com/carrotwaxr/peek-stash-browser/issues/new) with the **enhancement** label:

### Feature Request Template

```markdown
**Title:** Add bulk playlist operations

**Problem:**
Currently I have to add scenes to playlists one at a time,
which is tedious for large collections.

**Proposed Solution:**
Add checkboxes to scene cards with "Add Selected to Playlist" button.

**Alternatives:**
- Right-click context menu
- Keyboard shortcut for quick-add

**Priority:**
Medium - Nice to have but not urgent
```

## Providing Feedback

Beyond bugs and features, we'd love general feedback:

- **What works well?** What features do you love?
- **What's confusing?** UI unclear? Terminology wrong?
- **What's missing?** Essential features not yet implemented?
- **Performance?** How's the speed on your setup?

Share feedback via:
- [GitHub Discussions](https://github.com/carrotwaxr/peek-stash-browser/discussions)
- [Stash Discord](https://discord.gg/2TsNFKt) #third-party-integrations
- Email: (if you provide one)

## Known Issues

Current known issues (no need to report):

- ✅ Transcoding may fail on some exotic codecs
- ✅ Sprite sheet generation not yet implemented (using Stash's sprites)
- ✅ Theme customization UI not yet available
- ✅ Some keyboard shortcuts may conflict with browser shortcuts
- ✅ Mobile video controls need refinement
- ✅ No batch operations yet (coming soon)

## Beta Testing Checklist

Use this checklist to track your testing progress:

- [ ] Installation completed successfully
- [ ] Login with default credentials worked
- [ ] Changed default password
- [ ] Verified library content loads
- [ ] Tested direct video playback
- [ ] Tested transcoded playback (720p/480p/360p)
- [ ] Progress tracking saves and resumes correctly
- [ ] Created a playlist successfully
- [ ] Added scenes to playlist
- [ ] Played playlist with shuffle/repeat
- [ ] Scene search works
- [ ] Performer/Studio/Tag browsing works
- [ ] Keyboard navigation works (if applicable)
- [ ] Tested on mobile device (if applicable)
- [ ] Reported at least one bug or piece of feedback

## Thank You!

Your time and feedback are incredibly valuable. Every bug report, feature request, and piece of feedback helps make Peek better for everyone.

Happy testing! 🎉
