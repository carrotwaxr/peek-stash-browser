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
      -v /path/to/media:/app/media:ro \
      -v peek-data:/app/data \
      -e STASH_URL="http://your-stash:9999/graphql" \
      -e STASH_API_KEY="your_api_key" \
      -e JWT_SECRET="${JWT_SECRET}" \
      carrotwaxr/peek-stash-browser:latest
    ```

=== "unRAID"

    1. Search "Peek Stash Browser" in Community Applications
    2. Click Install
    3. Configure Stash URL and API key
    4. Generate JWT secret: `openssl rand -hex 32`
    5. Click Apply

=== "Docker Compose"

    ```bash
    git clone https://github.com/carrotwaxr/peek-stash-browser.git
    cd peek-stash-browser
    cp .env.example .env
    # Edit .env with your settings
    docker-compose up -d
    ```

## Step 2: Setup Wizard

1. Open browser: `http://localhost:6969` (or your server IP)
2. Complete the 5-step setup wizard:
   - **Welcome** - Introduction to Peek
   - **Discover Libraries** - Auto-discover your Stash library paths
   - **Configure Paths** - Map Stash paths to Peek container paths
   - **Create Admin** - Set your admin username and password
   - **Complete** - Setup finished!

!!! tip "Path Mapping Made Easy"
    The wizard automatically discovers your Stash libraries and helps you configure path mappings correctly!

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

1. Click **Playlists** in navigation
2. Click **Create Playlist**
3. Enter name and description
4. Add scenes by clicking the + icon on any scene
5. Play your playlist with shuffle/repeat options!

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

## Troubleshooting First-Time Issues

### Can't Login

- Check container logs: `docker logs peek-stash-browser`
- Verify database was created in `/app/data`
- Ensure `JWT_SECRET` is set (or auto-generated)

### No Scenes Showing

- Check `STASH_URL` is correct
- Verify `STASH_API_KEY` is valid
- Test Stash connectivity from container:
  ```bash
  docker exec peek-stash-browser curl http://your-stash:9999/graphql
  ```

### Videos Won't Play

- Verify media path is mounted correctly:
  ```bash
  docker exec peek-stash-browser ls /app/media
  ```
- Check path mapping configuration
- Ensure FFmpeg is installed (included in official image)

## Next Steps

- [Full Configuration Guide](configuration.md)
- [Complete Troubleshooting](../reference/troubleshooting.md)

## Need Help?

- [Troubleshooting Guide](../reference/troubleshooting.md)
- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- [Stash Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel
