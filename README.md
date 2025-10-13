# 👁️ Peek Stash Browser

A modern, responsive web application for browsing and managing your [Stash](https://github.com/stashapp/stash) media library with advanced filtering, authentication, and adaptive video streaming.

## ✨ Features

### 🎯 Core Functionality

- **🔐 Secure Authentication** - JWT-based authentication with role management (admin/user)
- **🎨 Modern Interface** - Beautiful, responsive React UI with theme support
- **🔍 Advanced Search & Filtering** - Comprehensive filtering across performers, scenes, studios, and tags
- **📊 Intelligent Sorting** - Multiple sorting options for all content types
- **📱 Mobile Ready** - Fully responsive design optimized for all devices

### 🎥 Video Streaming

- **🚀 Adaptive Transcoding** - Real-time HLS transcoding with multiple quality options (720p/480p/360p)
- **⚡ Smart Playback** - Direct play when possible, seamless fallback to transcoding
- **🎛️ Quality Controls** - Automatic and manual quality selection
- **⏯️ Session Management** - Intelligent cleanup of transcoding resources

### 📚 Content Management

- **📊 Detailed Views** - Enhanced detail pages for performers, studios, and tags
- **🏷️ Rich Metadata** - Display ratings, statistics, and comprehensive information
- **🔄 CRUD Operations** - Full create, read, update, delete capabilities
- **🎭 Theme Integration** - Consistent theming across all components

## 🚀 Quick Start

### Option 1: unRAID (Community Applications) - Easiest!

1. **Install from Community Applications**:
   - Search for "Peek Stash Browser" in unRAID's Community Applications
   - Click install and configure your settings
   - Access at `http://your-unraid-ip:6969`

### Option 2: Docker (Single Container) - Recommended

1. **Run with Docker**:

   ```bash
   docker run -d \
     --name stash-player \
     -p 6969:80 \
     -v /path/to/your/media:/app/media:ro \
     -v /path/to/stash-player/data:/app/data \
     -v /path/to/stash-player/tmp:/app/tmp \
     -e STASH_URL="http://your-stash-server:9999/graphql" \
     -e STASH_API_KEY="your_stash_api_key" \
     carrotwaxr/stash-player:latest
   ```

### Option 3: Docker Compose (Development)

1. **Clone and setup**:

   ```bash
   git clone https://github.com/carrotwaxr/stash-player.git
   cd stash-player
   cp .env.example .env
   ```

2. **Configure environment** (edit `.env`):

   ```bash
   STASH_URL=http://your-stash-server:9999/graphql
   STASH_API_KEY=your_stash_api_key
   DATABASE_URL=file:./data/stash-player.db
   TMP_DIR=/path/to/temp/directory
   ```

3. **Start services**:

   ```bash
   docker-compose up -d
   ```

4. **Access the app**: Open `http://localhost:6969`
5. **Login**: Use `admin` / `admin` (change immediately!)

## 🏗️ Architecture

Stash Player uses a modern **single-container architecture** for production deployments:

- **Frontend**: React app served by nginx on port 80
- **Backend**: Node.js/Express API server on port 8000 (proxied through nginx)
- **Database**: SQLite for user data and preferences (lightweight, no separate container needed)
- **Transcoding**: FFmpeg for real-time video conversion

**Development** uses Docker Compose with hot reloading for both frontend and backend.

## ⚙️ Configuration

### Required Settings

| Variable        | Description                 | Example                             |
| --------------- | --------------------------- | ----------------------------------- |
| `STASH_URL`     | Your Stash GraphQL endpoint | `http://192.168.1.100:9999/graphql` |
| `STASH_API_KEY` | API key from Stash settings | `eyJhbGciOiJIUzI1NiIsInR5cCI6...`   |

### Optional Settings (Advanced)

| Variable       | Description                | Default                          |
| -------------- | -------------------------- | -------------------------------- |
| `DATABASE_URL` | SQLite database file       | `file:/app/data/stash-player.db` |
| `TMP_DIR`      | Transcoding temp directory | `/app/tmp`                       |
| `NODE_ENV`     | Environment mode           | `production`                     |
| `JWT_SECRET`   | JWT signing key            | Auto-generated                   |

### Port Configuration

| Environment     | Port   | Service      | Description                              |
| --------------- | ------ | ------------ | ---------------------------------------- |
| **Production**  | `6969` | Complete App | nginx serves frontend + proxies API      |
| **Development** | `6969` | Frontend UI  | Vite dev server with hot reloading       |
| **Development** | `8000` | Backend API  | Express server (internal Docker network) |

**Production**: Only port `6969` exposed - nginx handles everything internally!  
**Development**: Both ports exposed for hot reloading, but `8000` is just for dev convenience.

## 🛠️ Setup Requirements

### Prerequisites

- **Stash Server** running with GraphQL API enabled
- **Docker** installed (Docker Compose only needed for development)
- **Network access** from container to Stash server
- **Storage space** for SQLite database and transcoding temp files

### Stash Configuration

1. **Enable API** in Stash settings
2. **Generate API key** in Settings → Security
3. **Note GraphQL endpoint** (usually `http://stash-ip:9999/graphql`)
4. **Ensure network access** from your Docker host to Stash

## 🎯 Usage Guide

### First Login

1. Navigate to `http://localhost:6969`
2. Login with default credentials: `admin` / `admin`
3. **⚠️ Important**: Change the password immediately in user settings

### Navigation

- **🏠 Home**: Dashboard with recent activity
- **🎬 Scenes**: Browse and filter video content
- **👥 Performers**: Manage talent profiles
- **🏢 Studios**: Organize by production companies
- **🏷️ Tags**: Content categorization

### Filtering & Sorting

- **Filter Panel**: Click filter icon to open advanced filters
- **Sort Controls**: Use dropdown menus to change sorting
- **Search**: Type to search across all content
- **Quick Filters**: Use preset filter buttons

### Video Playback

- **Auto Quality**: Automatically selects best quality
- **Manual Selection**: Click quality button to choose resolution
- **Seeking**: Full timeline scrubbing support
- **Keyboard Shortcuts**: Space (play/pause), Arrow keys (seek)

## 🔧 unRAID Setup

### Installation via Community Applications (Recommended)

1. **Open** unRAID WebUI → Apps → Community Applications
2. **Search** for "Stash Player"
3. **Install** and configure:

   | Setting                | Value                                 | Notes                        |
   | ---------------------- | ------------------------------------- | ---------------------------- |
   | **WebUI Port**         | `6969`                                | No conflicts, single port!   |
   | **Stash URL**          | `http://[IP]:9999/graphql`            | Replace [IP] with your Stash |
   | **Stash API Key**      | Your API key                          | From Stash settings          |
   | **Media Directory**    | `/mnt/user/media`                     | Path to your media files     |
   | **Database Directory** | `/mnt/user/appdata/stash-player/data` | SQLite database storage      |
   | **Temp Directory**     | `/mnt/user/appdata/stash-player/tmp`  | Video transcoding temp files |

4. **Click Apply** - Single container installs and starts automatically!
5. **Access**: `http://your-unraid-ip:6969`

### Manual Docker Run

```bash
docker run -d \
  --name=stash-player \
  -p 6969:80 \
  -v /mnt/user/media:/app/media:ro \
  -v /mnt/user/appdata/stash-player/data:/app/data \
  -v /mnt/user/appdata/stash-player/tmp:/app/tmp \
  -e STASH_URL="http://[IP]:9999/graphql" \
  -e STASH_API_KEY="your-api-key" \
  carrotwaxr/stash-player:latest
```

### Troubleshooting unRAID

**Container won't start**:

- Check Stash URL is accessible from unRAID: `ping stash-ip`
- Verify API key is correct (test in Stash GraphQL playground)
- Ensure app data directories exist: `/mnt/user/appdata/stash-player/`

**Media files not loading**:

- Verify media path matches your Stash library path
- Check file permissions (container runs as user 1000)
- Ensure Stash and Stash Player point to same media files

**Performance issues**:

- **Use cache drive** for app data (fast SQLite access)
- **Allocate RAM**: 2GB+ recommended for transcoding
- **Network**: Gigabit connection to Stash server preferred

**Port conflicts**:

- **Problem solved!** Single container uses only port 6969
- No more PostgreSQL port 5432 or backend port 8000 conflicts

## 🚨 Troubleshooting

### Common Issues

**"Cannot connect to Stash server"**:

- Verify Stash is running: `http://stash-ip:9999`
- Check GraphQL endpoint is enabled in Stash
- Test API key with GraphQL playground

**Authentication failures**:

- Check database connection
- Verify PostgreSQL container is healthy
- Reset with: `docker-compose restart backend`

**Video won't play**:

- Check media file permissions
- Verify FFmpeg is installed in backend container
- Monitor transcoding logs: `docker logs stash-player-backend`

**Slow performance**:

- Use SSD storage for PostgreSQL data
- Increase container memory limits
- Check network latency to Stash server

### Debugging Commands

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart services
docker-compose restart

# Reset database (⚠️ loses data)
docker-compose down -v
docker-compose up -d
```

## 📊 Performance & Scaling

### Hardware Recommendations

- **CPU**: 2+ cores (4+ for multiple transcoding streams)
- **RAM**: 2GB minimum (4GB+ recommended)
- **Storage**: SSD for database, network storage for media
- **Network**: Gigabit recommended for 4K content

### Optimization Tips

- **Use cache drives** for temporary transcoding files
- **Enable hardware acceleration** if supported
- **Limit concurrent streams** based on CPU capacity
- **Monitor resource usage** regularly

## 🔒 Security Considerations

### Authentication

- **Change default password** immediately after installation
- **Use strong passwords** for all accounts
- **Enable HTTPS** in production (reverse proxy recommended)
- **Regularly update** containers for security patches

### Network Security

- **Restrict access** to internal network if possible
- **Use reverse proxy** with SSL termination
- **Keep API keys secure** and rotate periodically
- **Monitor access logs** for suspicious activity

### Data Protection

- **Backup database** regularly
- **Use read-only mounts** for media files
- **Secure temp directories** with proper permissions
- **Implement access controls** as needed

## 🔄 Updates & Maintenance

### Automatic Updates (Recommended)

```bash
# Using Watchtower for auto-updates
docker run -d --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 3600
```

### Manual Updates

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Clean up old images
docker image prune -f
```

### Backup & Recovery

```bash
# Backup database
docker exec stash-player-db pg_dump -U $POSTGRES_USER stashplayer > backup.sql

# Restore database
docker exec -i stash-player-db psql -U $POSTGRES_USER stashplayer < backup.sql
```

## 📚 API Documentation

### Authentication Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info

### Library Endpoints

- `POST /api/library/scenes` - Filter and search scenes
- `POST /api/library/performers` - Filter and search performers
- `POST /api/library/studios` - Filter and search studios
- `POST /api/library/tags` - Filter and search tags

### Update Endpoints

- `PUT /api/library/scenes/:id` - Update scene
- `PUT /api/library/performers/:id` - Update performer
- `PUT /api/library/studios/:id` - Update studio
- `PUT /api/library/tags/:id` - Update tag

### Streaming Endpoints

- `GET /api/video/play` - Direct video playback
- `GET /api/stream/:sessionId/master.m3u8` - HLS master playlist
- `GET /api/stream/:sessionId/:quality/playlist.m3u8` - Quality playlist
- `GET /api/stream/:sessionId/:quality/segment_:num.ts` - Video segments

## 🤝 Contributing

We welcome contributions! See **[DEVELOPERS.md](DEVELOPERS.md)** for comprehensive developer documentation including:

- **Development Setup** - Environment configuration, dependencies, and workflow
- **Architecture Overview** - System components, technology stack, and design patterns
- **API Development** - Authentication, GraphQL integration, and endpoint examples
- **Frontend Development** - React components, theming, state management, and Video.js configuration
- **Testing Strategy** - Unit tests, integration tests, and debugging techniques
- **Deployment & DevOps** - Docker setup, CI/CD pipelines, and production deployment
- **Performance Optimization** - Frontend optimization, backend caching, and database queries
- **Security Best Practices** - Authentication, input validation, and file security

New contributors should start with the [Development Setup](DEVELOPERS.md#-development-setup) section.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Stash](https://github.com/stashapp/stash)** - The amazing media organizer this builds upon
- **[React](https://reactjs.org/)** - Frontend framework
- **[Express](https://expressjs.com/)** - Backend framework
- **[Prisma](https://prisma.io/)** - Database ORM
- **[Video.js](https://videojs.com/)** - Video player
- **[FFmpeg](https://ffmpeg.org/)** - Video transcoding

## 🔗 Links

- **[GitHub Repository](https://github.com/carrotwaxr/stash-player)**
- **[Docker Images](https://github.com/carrotwaxr/stash-player/pkgs/container/stash-player-frontend)**
- **[Issues & Support](https://github.com/carrotwaxr/stash-player/issues)**
- **[Stash Community](https://discord.gg/2TsNFKt)**
- `POSTGRES_USER/PASSWORD`: Database credentials
- `TMP_DIR`: Temporary directory for transcoding files

## Architecture

- **Frontend**: React with Vite, using Video.js for playback
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Transcoding**: FFmpeg with HLS output
- **Deployment**: Docker containers with nginx reverse proxy

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for detailed technical documentation covering:

- System architecture
- Transcoding system details
- API endpoints
- File management
- Theming system
- Performance considerations

## Development

### Local Development

1. Install dependencies:

   ```bash
   # Client
   cd client && npm install

   # Server
   cd server && npm install
   ```

2. Start development servers:

   ```bash
   # Terminal 1 - Backend
   cd server && npm run dev

   # Terminal 2 - Frontend
   cd client && npm run dev
   ```

3. Configure your local `.env` file with development settings

### Building

```bash
# Build frontend
cd client && npm run build

# Build backend
cd server && npm run build
```

## License

ISC License - see individual package.json files for details.
