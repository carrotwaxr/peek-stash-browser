# Stash Player for unRAID Installation Guide

## 🚀 Quick Installation

### Option 1: Community Applications (Recommended)

1. Open unRAID WebUI
2. Go to **Apps** → **Community Applications**
3. Search for "Stash Player"
4. Click **Install**
5. Configure your settings (see Configuration section below)

### Option 2: Manual Template Installation

1. Download the template from: `https://raw.githubusercontent.com/your-github-username/stash-player/master/unraid-template.xml`
2. In unRAID WebUI, go to **Docker** → **Add Container**
3. Click **Template** → **Import Template**
4. Paste the template URL and click **Import**
5. Configure settings and click **Apply**

### Option 3: Docker Compose (Advanced)

1. Install **Compose Manager** plugin from Community Applications
2. Create a new compose project
3. Use the provided `docker-compose.unraid.yml`

## ⚙️ Configuration

### Required Settings

| Setting             | Description                 | Example                             |
| ------------------- | --------------------------- | ----------------------------------- |
| **Stash URL**       | Your Stash GraphQL endpoint | `http://192.168.1.100:9999/graphql` |
| **Stash API Key**   | API key from Stash settings | `eyJhbGciOiJIUzI1NiIsInR5cCI6...`   |
| **Media Directory** | Path to your media files    | `/mnt/user/media`                   |
| **App Data**        | Directory for app data      | `/mnt/user/appdata/stash-player`    |

### Ports

| Port     | Service  | Description                            |
| -------- | -------- | -------------------------------------- |
| **3000** | Frontend | Web interface (change if needed)       |
| **8000** | Backend  | API server (usually no need to change) |

### Network Configuration

- **Bridge Mode**: Default, works for most setups
- **Host Mode**: Use if you have networking issues
- **Custom Network**: Advanced users can create a custom Docker network

## 🔧 Post-Installation Setup

### 1. Initial Access

1. Navigate to `http://your-unraid-ip:3000`
2. Login with default credentials: `admin` / `admin`
3. **Important**: Change the default password immediately!

### 2. Verify Stash Connection

- Go to any library section (Performers, Scenes, etc.)
- If you see "No data" or connection errors, check:
  - Stash URL is correct and accessible from unRAID
  - Stash API key is valid
  - Stash GraphQL endpoint is enabled

### 3. Configure Media Access

- Ensure your media directory is correctly mounted
- Test that you can see thumbnails and play videos
- Adjust file permissions if needed: `chown -R 1000:1000 /mnt/user/appdata/stash-player`

## 🛠️ Troubleshooting

### Common Issues

**Cannot connect to Stash server**

- Check if Stash is running: `http://stash-ip:9999`
- Verify GraphQL is enabled in Stash settings
- Test API key with a GraphQL client

**Database connection errors**

- Check container logs: Docker → Container → Logs
- Ensure PostgreSQL container is healthy
- Verify database credentials match

**Media files not accessible**

- Check volume mounts in container settings
- Verify file permissions: `ls -la /mnt/user/media`
- Ensure media path exists on unRAID

**Performance issues**

- Allocate more RAM to containers
- Use SSD cache for database if available
- Check network bandwidth to Stash server

### Container Logs

Access logs for debugging:

```bash
# View all container logs
docker logs stash-player-frontend
docker logs stash-player-backend
docker logs stash-player-db

# Follow live logs
docker logs -f stash-player-backend
```

### Health Checks

Monitor container health:

```bash
# Check container status
docker ps

# Check health status
docker inspect stash-player-backend | grep Health -A 10
```

## 🔄 Updates

### Automatic Updates (Recommended)

1. Install **Watchtower** from Community Applications
2. Configure it to monitor Stash Player containers
3. Updates will be applied automatically

### Manual Updates

1. Go to Docker → Container → Stash Player
2. Click **Check for Updates**
3. If available, click **Update**
4. Container will restart with new version

## 📁 Directory Structure

```
/mnt/user/appdata/stash-player/
├── db/              # PostgreSQL database files
├── tmp/             # Temporary transcoding files
├── logs/            # Application logs
└── config/          # Configuration files
```

## 🔐 Security Notes

1. **Change Default Password**: The default admin/admin credentials should be changed immediately
2. **API Key Security**: Keep your Stash API key secure and don't share it
3. **Network Access**: Consider using a reverse proxy (like Nginx Proxy Manager) for HTTPS
4. **Regular Backups**: Backup your `/mnt/user/appdata/stash-player/db` directory

## 🆘 Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/your-github-username/stash-player/issues)
- **unRAID Forums**: [Community support](https://forums.unraid.net/)
- **Documentation**: [Full documentation](https://github.com/your-github-username/stash-player/wiki)

## 📝 Advanced Configuration

### Custom Docker Network

For advanced users who want isolated networking:

```bash
# Create custom network
docker network create stash-player-net

# Run containers on custom network
# (Update container settings to use custom network)
```

### Resource Limits

Set resource limits for better performance:

- **Memory**: 512MB minimum, 2GB recommended
- **CPU**: 1-2 cores recommended for transcoding
- **Storage**: SSD recommended for database

### Environment Variables

Additional environment variables you can set:

```
NODE_ENV=production
LOG_LEVEL=info
TRANSCODE_QUALITY=high
MAX_CONCURRENT_STREAMS=3
```
