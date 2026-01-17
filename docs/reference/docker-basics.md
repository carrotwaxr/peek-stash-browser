# Docker Basics

New to Docker? This 5-minute guide covers everything you need to know to run Peek (or any Docker app).

## What is Docker?

Think of Docker as a **shipping container for software**. Just like a shipping container can hold anything and be moved anywhere, a Docker container packages an app with everything it needs to run - code, settings, databases - into one portable unit.

**Why use it?**

- **No installation headaches** - The app comes pre-configured
- **No dependency conflicts** - Each container is isolated
- **Easy updates** - Pull a new version, restart, done
- **Works everywhere** - Same container runs on Linux, Mac, Windows

## Key Concepts (The Scary Parts Explained)

### Images vs Containers

- **Image** = A blueprint/recipe (like a cake recipe)
- **Container** = A running instance of that image (like an actual cake)

You download an **image** once, then create **containers** from it. You can have multiple containers from the same image.

### The Three Things That Connect Your Container to the Outside World

When you run a Docker container, it's isolated by default - like a sealed box. These three options poke holes in that box:

#### 1. Ports (`-p`)

Containers have their own network. Ports connect the container's internal network to your computer.

```
-p 6969:80
    │    │
    │    └── Container's internal port (where the app listens)
    └─────── Your computer's port (what you type in browser)
```

**Example**: `-p 6969:80` means "when I go to `localhost:6969`, forward that to port 80 inside the container"

**Common mistake**: The app inside always uses its internal port. You only change the left number if port 6969 is already used on your computer.

#### 2. Volumes (`-v`)

Containers are temporary - when you delete one, everything inside is lost. Volumes are persistent storage that survives container deletion.

```
-v peek-data:/app/data
      │          │
      │          └── Path inside the container
      └────────────── Name of the volume (or path on your computer)
```

**Two types:**

- **Named volumes** (`peek-data:/app/data`) - Docker manages the storage location. Simple and recommended.
- **Bind mounts** (`/home/user/peek:/app/data`) - You specify exactly where on your computer. Useful when you need direct access to files.

**Why it matters**: Your database, settings, and playlists live in volumes. Delete the container, update it, whatever - your data stays safe.

#### 3. Environment Variables (`-e`)

Configuration values passed into the container. Like filling in blanks on a form.

```
-e JWT_SECRET="abc123"
      │           │
      │           └── The value
      └────────────── The variable name
```

**Common examples:**

- `JWT_SECRET` - A password for encrypting user sessions
- `TZ=America/New_York` - Timezone setting
- `PUID=1000` - User ID for file permissions

## Essential Commands

### Getting Images

```bash
# Download an image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Download a specific version
docker pull carrotwaxr/peek-stash-browser:3.1.0

# Download beta/development version (if available)
docker pull carrotwaxr/peek-stash-browser:beta
```

**Tags explained:**

- `:latest` - Most recent stable release (default if you don't specify)
- `:3.1.0` - Specific version number (good for stability)
- `:beta` - Pre-release testing version (may have bugs)

### Running Containers

```bash
# Basic run
docker run -d --name peek carrotwaxr/peek-stash-browser:latest

# Full example with all options (see Windows note below)
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v peek-data:/app/data \
  -e JWT_SECRET="your-secret-here" \
  --restart unless-stopped \
  carrotwaxr/peek-stash-browser:latest
```

**Flag meanings:**

| Flag | What it does |
|------|--------------|
| `-d` | Run in background (detached) |
| `--name peek` | Give the container a friendly name |
| `-p 6969:80` | Map port 6969 on your machine to port 80 in container |
| `-v peek-data:/app/data` | Persist data in a volume |
| `-e KEY=value` | Set environment variable |
| `--restart unless-stopped` | Auto-restart if it crashes or computer reboots |

**Windows users:** See [Platform-Specific Notes](#windows) for multi-line command syntax.

### Managing Running Containers

```bash
# See what's running
docker ps

# See all containers (including stopped)
docker ps -a

# Stop a container
docker stop peek-stash-browser

# Start a stopped container
docker start peek-stash-browser

# Restart a container
docker restart peek-stash-browser

# Remove a container (must be stopped first)
docker rm peek-stash-browser

# Force remove a running container
docker rm -f peek-stash-browser
```

### Viewing Logs

```bash
# See all logs
docker logs peek-stash-browser

# Follow logs in real-time (Ctrl+C to exit)
docker logs -f peek-stash-browser

# See last 50 lines
docker logs --tail 50 peek-stash-browser
```

### Running Commands Inside a Container

Sometimes you need to poke around inside a container:

```bash
# Open a shell inside the container
docker exec -it peek-stash-browser /bin/sh

# Run a single command
docker exec peek-stash-browser ls /app/data

# Check what's using disk space
docker exec peek-stash-browser du -sh /app/data/*
```

**Flags:**

- `-i` = Interactive (keep stdin open)
- `-t` = Allocate a terminal

Type `exit` to leave the shell.

### Updating a Container

Docker doesn't have an "update" command. The process is:

1. Pull the new image
2. Stop and remove the old container
3. Create a new container with the same settings

```bash
# 1. Pull latest image
docker pull carrotwaxr/peek-stash-browser:latest

# 2. Stop and remove old container
docker stop peek-stash-browser
docker rm peek-stash-browser

# 3. Run new container (same command as original install)
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v peek-data:/app/data \
  -e JWT_SECRET="your-secret-here" \
  carrotwaxr/peek-stash-browser:latest
```

Your data is safe because it's in the volume, not the container.

**Windows users:** See [Platform-Specific Notes](#windows) for multi-line command syntax.

### Cleanup

```bash
# Remove unused images (reclaim disk space)
docker image prune

# Remove all stopped containers
docker container prune

# Nuclear option: remove everything unused
docker system prune
```

## Platform-Specific Notes

### Windows

Docker Desktop for Windows runs Linux containers inside a lightweight VM. This works well but has some quirks:

**Performance:** Files stored on Windows (`C:\...`) are slower than named volumes. Stick with named volumes like `-v peek-data:/app/data` for best results.

**Path format:**

```powershell
# Windows paths in PowerShell
-v C:\Users\You\peek-data:/app/data

# Or use forward slashes
-v C:/Users/You/peek-data:/app/data
```

**Multi-line commands:** PowerShell uses backtick (`` ` ``) instead of backslash (`\`) to continue commands on the next line:

```powershell
docker run -d `
  --name peek `
  -p 6969:80 `
  carrotwaxr/peek-stash-browser:latest
```

### macOS

Similar to Windows - Docker runs in a VM. Named volumes are faster than bind mounts to your Mac filesystem.

### Linux

Docker runs natively - best performance. Bind mounts work great.

**Permission tip:** If you get permission errors with bind mounts, you may need to set `PUID` and `PGID` environment variables to match your user ID:

```bash
# Find your IDs
id

# Use them in docker run
-e PUID=1000 -e PGID=1000
```

## Quick Reference Card

| Task | Command |
|------|---------|
| Download image | `docker pull image:tag` |
| Run container | `docker run -d --name name image` |
| List running | `docker ps` |
| Stop | `docker stop name` |
| Start | `docker start name` |
| Remove | `docker rm name` |
| View logs | `docker logs name` |
| Follow logs | `docker logs -f name` |
| Shell access | `docker exec -it name /bin/sh` |
| Update | Pull → Stop → Remove → Run |
