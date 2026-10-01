# Watch History & Resume Playback

Peek automatically tracks your viewing progress and lets you resume playback exactly where you left off.

## How Watch History Works

### Automatic Tracking

Peek tracks your progress automatically while you watch:

- **Progress is saved every few seconds** during playback
- **Progress is saved when you leave**: changing scene, switching to another tab or app, or closing the page sends the seconds since the last save, so the last stretch you watched is not lost
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
- Scenes you've started but not finished: you stopped before the last 10% of the scene, after watching at least 2% of it
- Sorted by most recently watched
- Shows progress percentage
- Up to 12 scenes, always filled from your whole history (a finished, deleted or hidden scene never takes a slot)

**See more:** the link at the end of the row opens the [Watch History](#viewing-your-history) page.

**To resume:**
1. Go to Home page
2. Find the scene in **Continue Watching**
3. Click Play
4. Resumes from where you stopped

!!! tip "Fast Resume"
    Continue Watching is the fastest way to pick up where you left off!

### When Scenes Disappear from Continue Watching

A scene is removed from Continue Watching when:
- You **watch it to the end**: your last session stopped in the final 10% of the scene
- You **clear your watch history**
- It is **hidden** or restricted for you
- Twelve scenes you watched more recently are in progress

## Managing Watch History

### Viewing Your History

Open **Watch History** from the navigation (or the **See more** link on Continue Watching). It lists every scene you have watched, 24 to a page, with page controls under the list.

**Filter:**

- **All** - every scene you have played, watched for any length of time, or left with a resume point
- **In Progress** - scenes you stopped before the last 10%, after watching at least 2% of the scene (the same as Continue Watching)
- **Completed** - scenes you played at least once and whose last session finished, or stopped within the final 10% of the scene

**Sort:** Recently Watched, Most Watched (play count) or Longest Duration (time you watched).

The header shows the number of scenes in the view and **Total watch time** for the whole view, not just the page you are on. The filter, sort and page are in the address, so the Back button steps through your choices and a page can be bookmarked.

You can also see progress bars on scene cards throughout the app and watch progress on the scene detail page.

### Marking as Watched

A scene counts as completed when you have played it and your last session ended in the final 10%:

1. Open the scene detail page
2. Play it to the end, or seek into the last 10% and let it play for a few seconds
3. The scene appears under **Completed** in Watch History

### Removing an O

Pressed the O button by mistake? Choose **Remove last O** in a scene card's menu (⋮), or in the menu beside the O button on the scene page. It takes away your newest O on that scene, and the performer, studio and tag totals built from it. The item shows only while the scene's O count is above 0. With Sync to Stash on, Stash's newest O on the scene is removed too.

### Clearing Watch History

Peek has no clear for a single scene. To clear everything:

1. Go to **Watch History**
2. Click **Clear History**
3. Confirm the action
4. All scene progress is reset, and Home's Continue Watching and your stats refresh

Clear History clears **scene history only**: plays, watch time, resume points and O counts, and the performer, studio and tag totals built from them. Image views and image O counts are kept. It cannot be undone.

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
- All your in-progress scenes are completed (they are under **Completed** in Watch History)
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
