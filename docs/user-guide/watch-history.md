# Watch History & Resume Playback

Peek automatically tracks your viewing progress and lets you resume playback exactly where you left off.

## How Watch History Works

### Automatic Tracking

Peek tracks your progress automatically while you watch:

- **Progress is saved every few seconds** during playback
- **No manual action needed** - just watch normally
- **Per-user tracking** - each user has their own watch history
- **Syncs across devices** - resume on any device where you're logged in

### What Gets Tracked

For each scene you watch, Peek remembers:

- **Current position** - Exact timestamp where you stopped
- **Total progress** - Percentage watched (e.g., 65% complete)
- **Last watched date** - When you last viewed this scene
- **Watch count** - How many times you've watched it

## Resume Playback

### Automatic Resume

When you click Play on a scene you've partially watched:

1. Video player opens
2. You see a **"Resume from [timestamp]"** notification
3. Player automatically jumps to where you left off
4. Click **"Start from beginning"** if you prefer to restart

!!! tip "Quick Resume"
    The resume prompt appears for 5 seconds. If you do nothing, playback continues from your last position automatically!

### From Scene Cards

Scene cards show your progress visually:

- **Progress bar** at the bottom of the thumbnail
- **Percentage indicator** (e.g., "65% watched")
- **Blue progress bar** fills from left to right as you watch

**To resume from a scene card:**
1. Find the scene (look for the progress bar)
2. Click Play
3. Playback resumes automatically

## Continue Watching

### Quick Access to In-Progress Scenes

The **Continue Watching** section shows all partially-watched scenes:

**Location:** Home page (top section)

**What appears here:**
- Scenes you've started but not finished
- Sorted by most recently watched
- Shows progress percentage
- Limited to your last 20 in-progress scenes

**To resume:**
1. Go to Home page
2. Find the scene in **Continue Watching**
3. Click Play
4. Resumes from where you stopped

!!! tip "Fast Resume"
    Continue Watching is the fastest way to pick up where you left off!

### When Scenes Disappear from Continue Watching

A scene is removed from Continue Watching when:
- You **watch to completion** (95%+ watched counts as complete)
- You **manually clear watch history** for that scene
- It falls outside your **last 20 in-progress scenes**

## Managing Watch History

### Viewing Your History

**Full watch history coming in future update.** Currently:

- View in-progress scenes via **Continue Watching** on home page
- See progress bars on scene cards throughout the app
- Check scene detail page for watch progress

### Marking as Watched

To mark a scene as fully watched without watching it:

1. Open the scene detail page
2. Seek to the end of the video (last 5%)
3. Let it play for a few seconds
4. Scene is marked as watched

Or manually skip to 95%+ completion to trigger "watched" status.

### Clearing Watch History

**For a single scene:**

1. Open the scene detail page
2. Click the **⋮** (three dots) menu
3. Select **"Clear watch history"**
4. Progress is reset to 0%

**For all scenes:**

1. Go to **Settings** → **My Settings**
2. Scroll to **Watch History** section
3. Click **"Clear all watch history"**
4. Confirm the action
5. All progress is reset

!!! warning "Cannot Be Undone"
    Clearing watch history is permanent. You cannot restore cleared progress.

## Privacy & Data

### What's Stored

Watch history is stored in Peek's database:

- **User ID** - Associated with your account
- **Scene ID** - Which scene you watched
- **Progress position** - Timestamp (in seconds)
- **Last watched date** - When you last viewed it
- **Watch count** - Total number of views

### What's NOT Stored

- **No video file access logs** - Peek doesn't log file system access
- **No sharing with Stash** - Watch history stays in Peek only
- **No external tracking** - History never leaves your Peek instance

### Privacy Controls

- **Per-user isolation** - You only see your own history
- **Admin cannot see** - Even admins can't view other users' watch history
- **Clear anytime** - You control your history data

## Watch History Tips

### Efficient Binge Watching

1. Start watching scenes you want to explore
2. Switch between different scenes freely
3. Return to **Continue Watching** to resume any of them
4. No need to finish in one sitting

### Organize with Playlists

Combine watch history with playlists:

1. Create a **"To Watch"** playlist
2. Add scenes you plan to watch later
3. Watch them at your own pace
4. Progress tracked automatically
5. Resume from **Continue Watching** or the playlist

### Track Rewatches

Want to rewatch a favorite scene?

1. Click Play on an already-watched scene
2. Choose **"Start from beginning"** when prompted
3. Watch count increments
4. New progress tracked

## Troubleshooting

### Resume not working

**Solution:**
- Make sure you're logged in (watch history is per-user)
- Check that you watched for at least 10 seconds (minimum tracking threshold)
- Verify you're using the same user account
- Try refreshing the page

### Progress bar not showing

**Solution:**
- Progress may not appear if you only watched a few seconds
- Progress bars require at least 5% completion to display
- Try playing the video for longer
- Clear browser cache if progress seems stuck

### Continue Watching is empty

**Possible reasons:**
- You haven't started watching any scenes yet
- All your in-progress scenes are completed
- You cleared your watch history
- You're using a different user account

### Progress resets unexpectedly

**Solution:**
- Check if someone else cleared watch history (admin action)
- Verify you're logged in (anonymous users don't save history)
- Check browser console for errors (F12 → Console)
- Report as a bug if it persists

## Keyboard Shortcuts

While watching a video:

| Key | Action |
|-----|--------|
| `←` | Seek backward 5s |
| `→` | Seek forward 5s |
| `J` | Seek backward 10s |
| `L` | Seek forward 10s |
| `Space` | Play/Pause |
| `F` | Toggle fullscreen |
| `M` | Mute/unmute |

See the [Keyboard Navigation Guide](keyboard-navigation.md) for complete shortcuts.

## Next Steps

- [Keyboard Navigation](keyboard-navigation.md) - Complete keyboard shortcuts and TV mode
- [Playlists](playlists.md) - Organize scenes into custom playlists
- [Quick Start Guide](../getting-started/quick-start.md) - Get started with Peek
