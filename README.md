# Peek Stash Browser

A self-hosted, multi-user front end for one or more [Stash](https://github.com/stashapp/stash) servers. Stash stays your library manager; Peek gives each person their own account, ratings, history and limits on what they can see.

## What Peek adds to Stash

- **Accounts and access** - Admin and user accounts, groups that grant sharing and download permissions (denied by default), recovery keys, sign-in through an SSO proxy (Authelia, Authentik, oauth2-proxy and others), and a setup wizard.
- **Your own data** - Ratings, favorites, watch history, resume points, O counts, hidden items, saved filters and themes belong to each user, on all seven kinds of item. The ratings and counts you see are yours, not Stash's.
- **Content restrictions** - An admin gives a user show-only or always-hide lists of collections, tags, studios and galleries. They apply everywhere: lists, search, recommendations, downloads and playback.
- **Several Stash servers** - One Peek can sit in front of several Stash servers. Each user chooses which ones they see.
- **Media through Peek** - Streams, captions and images are served by Peek, so users never get Stash's address or API key. External players such as VLC get a personal signed link.
- **Playlists and browsing** - Named playlists you can share with groups, TV mode, timeline and folder views, recommendations and similar scenes from your own history.
- **Downloads** - Scene files and playlist zips with NFO files, for the users and groups you allow.
- **Operations** - A synced cache of each Stash library, reconciliation after Stash merges, optional per-user Sync to Stash and Sync from Stash, and database backups.

### What stays in Stash

Peek never edits your Stash metadata. Stash does the scanning, scraping, tagging and transcoding; Peek is how several people browse the result.

## Quick Start

### Prerequisites

Before installing Peek:

1. **Stash Server** running with GraphQL API enabled
2. **Stash API Key** generated in Stash Settings → Security
3. **Docker** installed on your system
4. **Network access** from Docker to your Stash server

> **Note**: As of v2.0, Peek streams video directly through Stash - no media volume mounts required!

### Docker Installation (Linux/macOS)

```bash
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Run Peek
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v peek-data:/app/data \
  --restart unless-stopped \
  carrotwaxr/peek-stash-browser:latest
```

### Docker Installation (Windows)

```powershell
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Run Peek
docker run -d `
  --name peek-stash-browser `
  -p 6969:80 `
  -v peek-data:/app/data `
  --restart unless-stopped `
  carrotwaxr/peek-stash-browser:latest
```

### unRAID Installation

**Step 1: Download the template**

```
https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml
```

**Step 2: Install the template**

Copy `unraid-template.xml` to:

```
/boot/config/plugins/dockerMan/templates-user/
```

**Step 3: Configure the container**

1. Go to Docker tab → Add Container
2. Select "peek-stash-browser" from User Templates dropdown
3. Set the data directory:
   - **App Data Directory**: Path for Peek data (e.g., `/mnt/user/appdata/peek-stash-browser`)
4. Click Apply
5. Access at `http://your-unraid-ip:6969`

### First Access - Setup Wizard

After installation, open `http://localhost:6969` (or your server's IP) in a browser. You'll be guided through a 4-step setup wizard:

1. **Welcome** - Introduction to Peek
2. **Create Admin User** - Choose the password for the `admin` account
3. **Connect to Stash** - Enter your Stash URL and API key
4. **Complete** - Setup finished!

The wizard stores your Stash connection details in Peek's database, on the server. Users never see them.

## Configuration

### Environment Variables

| Variable            | Required | Default                                                   | Description                                                                          |
| ------------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `JWT_SECRET`        | No       | Generated on first start, kept in `/app/data/.jwt-secret` | Signs login sessions; set it only to control the value (`openssl rand -base64 32`)   |
| `CONFIG_DIR`        | No       | `/app/data`                                               | Where backups, download zips and `.jwt-secret` go; the database stays in `/app/data` |
| `PUID`              | No       | `99`                                                      | User that owns `/app/data` and runs the server; set to `id -u` for a host bind mount |
| `PGID`              | No       | `100`                                                     | Group that owns `/app/data`; set to `id -g` for a host bind mount                    |
| `PROXY_AUTH_HEADER` | No       | (disabled)                                                | Enable proxy authentication (e.g., `X-Forwarded-User`)                               |

> **Note**: Peek signs login sessions with a secret it generates on first start and keeps in `/app/data/.jwt-secret`. Set `JWT_SECRET` only to control the value.

> **Note**: Stash connection details (URL and API key) are configured via the Setup Wizard and stored in the database. No environment variables needed!

> **Proxy Authentication**: For SSO/auth proxy integration (Authelia, Authentik, etc.), see the [Proxy Authentication](https://carrotwaxr.github.io/peek-stash-browser/getting-started/configuration/#proxy-authentication) documentation. **Important**: Peek must not be publicly accessible when using proxy auth.

## Updating Peek

### Check for Updates

Peek includes a built-in update checker:

1. Go to **Settings → Server Settings**
2. Open the **Server Configuration** tab and find **Version Information**

Peek checks GitHub for new releases when the section opens and tells you if an update is available. **Check for Updates** checks again.

### Update to Latest Version

To update your Docker container to the latest version:

**Step 1: Stop and remove the current container**

```bash
docker stop peek-stash-browser
docker rm peek-stash-browser
```

**Step 2: Pull the latest image**

```bash
docker pull carrotwaxr/peek-stash-browser:latest
```

**Step 3: Start the new container**

Use the same `docker run` command you used for initial installation. Your data persists in the `peek-data` volume.

**Linux/macOS example:**

```bash
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v peek-data:/app/data \
  --restart unless-stopped \
  carrotwaxr/peek-stash-browser:latest
```

**Windows example:**

```powershell
docker run -d `
  --name peek-stash-browser `
  -p 6969:80 `
  -v peek-data:/app/data `
  --restart unless-stopped `
  carrotwaxr/peek-stash-browser:latest
```

**unRAID users:** Simply click **Force Update** in the Docker tab to pull the latest image and restart.

**Note:** Your database, user settings, and playlists are stored in the `peek-data` volume and will persist across updates.

### Use Specific Version

If you prefer to pin to a specific version instead of `:latest`:

```bash
# Pull specific version
docker pull carrotwaxr/peek-stash-browser:3.3.8

# Use in docker run command
docker run ... carrotwaxr/peek-stash-browser:3.3.8
```

Available versions are listed on [GitHub Releases](https://github.com/carrotwaxr/peek-stash-browser/releases).

## Documentation

Full documentation: **[https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)**

- [Quick Start](https://carrotwaxr.github.io/peek-stash-browser/getting-started/installation/)
- [What Peek Is](https://carrotwaxr.github.io/peek-stash-browser/what-peek-is/)
- [Configuration](https://carrotwaxr.github.io/peek-stash-browser/getting-started/configuration/)
- [Upgrading](https://carrotwaxr.github.io/peek-stash-browser/getting-started/upgrading/)
- [Troubleshooting](https://carrotwaxr.github.io/peek-stash-browser/getting-started/troubleshooting/)

## Requirements

- Stash server with GraphQL API enabled
- Docker (or unRAID)
- Network access between Peek and Stash

## Support

- **Documentation**: [https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)
- **Questions and community**: [Peek thread on the Stash forum](https://discourse.stashapp.cc/t/peek-stash-browser/4018)
- **Bug Reports and Feature Requests**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, and other amazing open source projects.
