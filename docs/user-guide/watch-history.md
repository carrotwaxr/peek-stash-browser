# Watch History

Peek automatically tracks your viewing activity, allowing you to resume videos where you left off and review your watch history.

## Features

### Automatic Tracking

Watch history is tracked automatically when you watch videos:

- **Play Count**: Increments after watching a video for 5 minutes
- **Play Duration**: Total time spent watching each scene
- **Resume Time**: Last playback position for resuming later
- **O Counter**: Interactive button to track personal markers with timestamps
- **Last Watched**: Timestamp of when you last watched the scene

### Resume Watching

When you return to a partially-watched video:

1. A dialog appears asking if you want to resume or start from the beginning
2. Click **Resume** to continue from where you left off
3. Click **Start from Beginning** to start over

### Continue Watching Carousel

The home page displays a "Continue Watching" carousel showing:

- Recently watched scenes with resume times
- Visual progress bars showing how much you've watched
- Quick access to resume playback

### Watch History Page

Access your full watch history from the user menu:

1. Click your username in the top-right corner
2. Select **Watch History** from the dropdown

The Watch History page allows you to:

- **Sort by**:
  - Recently Watched (default)
  - Most Watched (by play count)
  - Longest Duration (total watch time)

- **Filter by**:
  - All (shows everything)
  - In Progress (partially watched videos)
  - Completed (videos watched to ~90% or more)

- **View stats**:
  - Total number of scenes watched
  - Total watch time across all scenes
  - Individual scene watch details:
    - Last watched time
    - Resume position with percentage
    - Total watch duration
    - Play count and O counter

### Progress Indicators

Visual indicators help you track your progress:

- **Green progress bar**: Appears at the bottom of scene thumbnails showing percentage watched
- **Resume time**: Displayed in watch history with time and percentage
- **Completion status**: Scenes watched to 90% or more are considered "completed"

### O Counter

The O counter has been enhanced to an interactive button:

- **Click** the heart icon (♥) to increment the counter
- Each click is timestamped
- Displays with a +1 animation for visual feedback
- Double-click protection prevents accidental increments
- Future sync with Stash's O counter planned

## Technical Details

### Tracking Mechanism

- **30-second pings**: While a video is playing, progress is saved every 30 seconds
- **Event listeners**: Detects pause, seeking, tab switching, and closing
- **Reliable delivery**: Uses `navigator.sendBeacon` for final ping when closing tabs
- **Per-user tracking**: Each user has their own independent watch history

### Privacy

- Watch history is stored locally in Peek's database
- Data is tied to your user account
- Only you can see your watch history
- Future Stash sync will aggregate all users' watch data (planned feature)

## Tips

1. **Resume videos quickly**: Use the Continue Watching carousel on the home page
2. **Track favorites**: Use the O counter to mark special moments or favorite scenes
3. **Review watch patterns**: Sort by "Most Watched" or "Longest Duration" to see your viewing habits
4. **Clean up**: Filter by "In Progress" to find videos you started but didn't finish
