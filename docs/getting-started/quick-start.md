# Quick Start

Get Peek up and running in 5 minutes!

## Step 1: Install Peek

=== "Docker (Fastest)"

    ```bash
    # Pull the latest image
    docker pull carrotwaxr/peek-stash-browser:latest

    # Run Peek
    docker run -d \
      --name peek-stash-browser \
      -p 6969:80 \
      -v peek-data:/app/data \
      --restart unless-stopped \
      carrotwaxr/peek-stash-browser:latest
    ```

=== "unRAID"

    1. Download the [unRAID template](https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml)
    2. Copy to `/boot/config/plugins/dockerMan/templates-user/`
    3. Go to Docker → Add Container → Select "Peek" from User Templates
    4. Click Apply

!!! tip "For Developers"
    Want to contribute or run with hot reloading? See [Local Development Setup](../development/local-setup.md).

## Step 2: Setup Wizard

Open your browser to `http://localhost:6969` (or your server IP). The setup wizard runs automatically on first access.

**Step 1 — Welcome**

Introduction to Peek. Click **Get Started** to begin.

**Step 2 — Create Admin Account**

- Username is set to "admin"
- Choose a password (minimum 8 characters, at least 1 letter and 1 number)
- You're automatically logged in after creation. If you leave and come back to the wizard later, it asks you to sign in as the admin before the Stash step

**Step 3 — Connect to Stash**

- Enter your **Stash URL** — the full GraphQL endpoint (e.g., `http://192.168.1.100:9999/graphql`)
- Enter your **API Key** — found in your Stash instance under Settings → Security
- Click **Test Connection** to verify before continuing
- The wizard provides clear error messages if the connection fails (wrong URL, bad API key, host not found, etc.)

**Step 4 — Complete**

Setup is finished. Click **Start Browsing** to enter Peek. Your first library sync begins automatically in the background.

!!! tip "Adding More Stash Servers Later"
    You can connect additional Stash instances after setup. See [Multi-Instance Support](configuration.md#multi-instance-support).

## Step 3: Browse Your Library

- **Scenes**: Browse all your video content
- **Performers**: View performers and their scenes
- **Studios**: Explore by production company
- **Tags**: Find content by tags

## Step 4: Watch Videos

1. Click any scene to view details
2. Click Play to start video
3. Peek plays Stash's Direct stream when your browser can decode the file, and a Stash transcode when it cannot
4. Use timeline to seek through video

## Step 5: Create Playlists

Organize your favorite scenes into custom playlists:

1. Click **Playlists** in the navigation menu
2. Click **Create Playlist**
3. Enter a name and optional description
4. Click **Create**

**Adding Scenes:**
- Open a scene and click **Add to Playlist**, then pick your playlist
- Or select several scenes and click **Add to Playlist** on the bar that appears

**Playing Playlists:**
- Click a playlist to view its scenes
- Click **Play** to start playback
- Use **Shuffle** to randomize order
- Use **Repeat** to loop your playlist

!!! tip "Learn More"
    See the [Complete Playlists Guide](../user-guide/playlists.md) for reordering scenes, editing playlists, and more!

## Common Tasks

### Update Admin Password

1. Open **Settings → User Preferences → Account**
2. Under **Change Password**, enter your current password, then the new one twice
3. Click **Change Password**

### Create Additional Users

1. Open **Settings → Server Settings → User Management** (admin only)
2. Click **Create User**
3. Enter a username and a password
4. Select the role (Admin or User)
5. Click **Create User**

### Configure Theme

1. Open **Settings → User Preferences → Theme**
2. Choose Peek, Light, Midnight Blue, Deep Purple or The Hub, or create a custom theme
3. The theme is saved to your account at once and follows you to every browser

## Video Playback Tips

- **Direct stream**: When your browser can decode the file, Peek plays Stash's Direct stream, the file as it is
- **Transcode**: When it cannot, Peek plays one of Stash's transcodes instead
- **Source menu**: The source menu in the player controls lets you pick another source

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` or `K` | Play/Pause |
| `←` | Seek backward 5s |
| `→` | Seek forward 5s |
| `J` | Seek backward 10s |
| `L` | Seek forward 10s |
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
- The session secret is generated into `/app/data` on first start; the container stops with a message in the log if that directory is not writable

### No Scenes Showing

- Check your Stash connection in Settings → Server Settings → Server Configuration → Stash Instances
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
- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues) for bugs
- [Peek on the Stash community forum](https://discourse.stashapp.cc/t/peek-stash-browser/4018) for questions
