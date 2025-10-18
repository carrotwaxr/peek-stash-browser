# Settings

Configure Peek to match your preferences and manage your account.

## Accessing Settings

1. Click your **username** in the top-right corner
2. Select **Settings** from the dropdown menu

## User Preferences

### Theme

Choose between light and dark themes:

- **Dark Mode** (default): Easier on the eyes in low light
- **Light Mode**: Better for bright environments

!!! tip "System Theme"
    Peek respects your browser's color scheme preference by default.

### Language

Language selection (planned for future release):

- English (current)
- Additional languages coming soon

## Account Management

### Change Password

1. Navigate to **Settings** → **Account**
2. Enter your **current password**
3. Enter your **new password**
4. Confirm **new password**
5. Click **Save Changes**

!!! warning "Password Requirements"
    Passwords must be at least 6 characters long.

### Email Address

Update your email address:

1. Navigate to **Settings** → **Account**
2. Enter your **new email**
3. Enter your **password** to confirm
4. Click **Save Changes**

## Video Playback Preferences

### Default Quality

Set your preferred default quality:

- **Auto** (recommended): Automatically adapts to bandwidth
- **720p**: Best quality, requires good connection
- **480p**: Balanced quality and bandwidth
- **360p**: Lower quality, works on slow connections

### Autoplay

Control autoplay behavior:

- **Enabled**: Videos start playing automatically
- **Disabled**: Click play to start videos

### Playback Speed

Set your preferred default playback speed:

- **0.5x**: Half speed
- **1x**: Normal speed (default)
- **1.25x**: Slightly faster
- **1.5x**: Faster
- **2x**: Double speed

## Privacy & Security

### Session Management

View and manage active sessions:

- See list of active devices/browsers
- Revoke access to specific sessions
- End all other sessions

### Login History

View recent login activity:

- Date and time
- IP address
- Browser and device
- Location (approximate)

!!! info "Security Tip"
    Review your login history regularly to ensure account security.

## Admin Settings

Admin users have access to additional settings.

### User Management

Admins can manage all users:

1. Navigate to **Settings** → **Users**
2. View list of all users
3. Create new users
4. Edit user roles (Admin/User)
5. Disable or delete users

**Creating a New User**:

1. Click **Add User**
2. Enter **email**
3. Enter **password**
4. Select **role** (Admin or User)
5. Click **Create**

### Server Settings

View server information and configuration:

- **Version**: Current Peek version
- **Stash Connection**: Connection status to Stash server
- **Database**: SQLite database info
- **Storage**: Disk usage for temp files

### System Health

Monitor system health:

- **CPU Usage**: Current CPU utilization
- **Memory**: RAM usage
- **Active Sessions**: Number of transcoding sessions
- **Uptime**: Server uptime

## Notifications

Configure notification preferences (planned feature):

- **Email Notifications**: Get email for important events
- **Browser Notifications**: Push notifications in browser
- **Notification Types**: Choose which events to be notified about

## Data & Privacy

### Export Data

Export your user data:

1. Navigate to **Settings** → **Privacy**
2. Click **Export Data**
3. Download JSON file with your data

**Exported data includes**:
- Account information
- Preferences
- Playlist data (when available)
- Viewing history (when available)

### Delete Account

Permanently delete your account:

1. Navigate to **Settings** → **Privacy**
2. Click **Delete Account**
3. Enter your **password** to confirm
4. Click **Permanently Delete**

!!! danger "Warning: This Cannot Be Undone"
    Deleting your account is permanent and cannot be reversed.

## Troubleshooting Settings

### Reset to Defaults

If you experience issues with settings:

1. Navigate to **Settings** → **Advanced**
2. Click **Reset to Defaults**
3. Confirm reset

This will reset:
- Theme preferences
- Video playback defaults
- UI preferences

This will NOT reset:
- Account credentials
- User role
- Admin-configured server settings

### Clear Cache

Clear local browser cache:

1. Navigate to **Settings** → **Advanced**
2. Click **Clear Cache**
3. Refresh the page

This clears:
- Temporary data
- Cached API responses
- Session data

## Next Steps

- [Video Playback](video-playback.md) - Configure playback preferences
- [Search & Browse](search-browse.md) - Find content
- [Security](../reference/security.md) - Security best practices
