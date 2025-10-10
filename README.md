# Stash Player

A modern video streaming application with adaptive transcoding capabilities, designed to work seamlessly with Stash media manager.

## Features

- **Adaptive Video Transcoding**: Real-time HLS transcoding with multiple quality options
- **Responsive Design**: Mobile-first UI that works on all devices
- **Stash Integration**: Direct integration with Stash API for media library management
- **Docker Deployment**: Complete containerized setup with PostgreSQL database
- **Session Management**: Automatic cleanup of temporary transcoding files
- **Theming Support**: Built-in light/dark theme switching

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Stash media server running with API access

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd stash-player
   ```

2. Copy and configure environment variables:
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your configuration
   ```

3. Start the application:
   ```bash
   docker-compose up -d
   ```

4. Access the application at `http://localhost:3000`

## Configuration

Key environment variables in `server/.env`:

- `STASH_URL`: Your Stash server URL (e.g., `http://10.0.0.4:9999/graphql`)
- `STASH_API_KEY`: API key from your Stash server
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