# Quick Start

Get Peek up and running in 5 minutes!

## Step 1: Install Peek

=== "Docker (Fastest)"

    ```bash
    # Pull the latest image
    docker pull carrotwaxr/peek-stash-browser:latest

    # Generate JWT secret
    export JWT_SECRET=$(openssl rand -base64 32)

    # Run Peek
    docker run -d \
      --name peek-stash-browser \
      -p 6969:80 \
      -v peek-data:/app/data \
      -e JWT_SECRET="${JWT_SECRET}" \
      carrotwaxr/peek-stash-browser:latest
    ```

=== "unRAID"

    1. Download the [unRAID template](https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml)
    2. Copy to `/boot/config/plugins/dockerMan/templates-user/`
    3. Go to Docker → Add Container → Select "Peek" from User Templates
    4. Generate JWT secret: `openssl rand -hex 32`
    5. Click Apply

!!! tip "For Developers"
    Want to contribute or run with hot reloading? See [Local Development Setup](../development/local-setup.md).

## Step 2: Setup Wizard

1. Open browser: `http://localhost:6969` (or your server IP)
2. Complete the 4-step setup wizard:
   - **Welcome** - Introduction to Peek
   - **Create Admin** - Set your admin username and password
   - **Connect to Stash** - Enter your Stash URL and API key
   - **Complete** - Setup finished!

## Step 3: Browse Your Library

- **Scenes**: Browse all your video content
- **Performers**: View performers and their scenes
- **Studios**: Explore by production company
- **Tags**: Find content by tags

## Step 4: Watch Videos

1. Click any scene to view details
2. Click Play to start video
3. Quality automatically adjusts based on network
4. Use timeline to seek through video

## Step 5: Create Playlists

Organize your favorite scenes into custom playlists:

1. Click **Playlists** in the navigation menu
2. Click **Create Playlist**
3. Enter a name and optional description
4. Click **Create**

**Adding Scenes:**
- Click the **+** icon on any scene card
- Select your playlist from the menu
- Scene is added instantly!

**Playing Playlists:**
- Click a playlist to view its scenes
- Click **Play** to start playback
- Use **Shuffle** to randomize order
- Use **Repeat** to loop your playlist

!!! tip "Learn More"
    See the [Complete Playlists Guide](../user-guide/playlists.md) for reordering scenes, editing playlists, and more!

## Common Tasks

### Update Admin Password

1. Click user icon (top right)
2. Select **Settings**
3. Enter new password
4. Click **Save**

### Create Additional Users

1. Go to **Users** (admin only)
2. Click **Create User**
3. Enter username, email, password
4. Select role (Admin or User)
5. Click **Create**

### Configure Theme

1. Click theme toggle icon (moon/sun)
2. Choose Dark or Light mode
3. Theme preference is saved automatically

## Video Playback Tips

- **Direct Play**: If browser supports the format, plays directly (no transcoding)
- **Transcoded**: HLS streaming with adaptive quality when needed
- **Seeking**: Full timeline scrubbing works in both modes
- **Quality**: Click quality button to manually select resolution

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` | Seek backward 10s |
| `→` | Seek forward 10s |
| `↑` | Volume up |
| `↓` | Volume down |
| `F` | Toggle fullscreen |
| `M` | Mute/unmute |

!!! tip "Full Keyboard Navigation"
    Peek supports complete keyboard navigation including TV mode! See the [Keyboard Navigation Guide](../user-guide/keyboard-navigation.md) for all shortcuts.

## Troubleshooting First-Time Issues

### Can't Login

- Check container logs: `docker logs peek-stash-browser`
- Verify database was created in `/app/data`
- Ensure `JWT_SECRET` is set (or auto-generated)

### No Scenes Showing

- Check your Stash connection in Settings → Server Settings
- Verify your Stash API key is valid in Stash → Settings → Security
- Test Stash connectivity from container:
  ```bash
  docker exec peek-stash-browser curl http://your-stash:9999/graphql
  ```

### Videos Won't Play

- Check container logs: `docker logs peek-stash-browser`
- Verify Stash is accessible and streaming is working in Stash itself
- Check browser console for errors

## Next Steps

- [Full Configuration Guide](configuration.md)
- [Complete Troubleshooting](troubleshooting.md)

## Need Help?

- [Troubleshooting Guide](troubleshooting.md)
- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- [Stash Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel
