# Stash Player - Technical Documentation

A modern video streaming application with adaptive transcoding, built with React frontend and Node.js backend.

## Table of Contents

- [System Architecture](#system-architecture)
- [Transcoding System](#transcoding-system)
- [API Documentation](#api-documentation)
- [File Management & Cleanup](#file-management--cleanup)
- [Frontend Theming System](#frontend-theming-system)
- [Storage & Performance](#storage--performance)
- [Future Improvements](#future-improvements)

---

## System Architecture

### Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │────│  Node.js Server  │────│  Stash GraphQL  │
│   (Frontend)    │    │   (Backend)      │    │     (API)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │
         │              ┌─────────────────┐
         │              │   FFmpeg        │
         └──────────────│   Transcoding   │
                        │   Engine        │
                        └─────────────────┘
```

### Components

- **Frontend**: React SPA with Video.js player, responsive design
- **Backend**: Express.js API with session management and transcoding orchestration
- **Transcoding**: FFmpeg-based HLS streaming with multiple quality tiers
- **Integration**: Stash GraphQL API for metadata and file management

---

## Transcoding System

### Session Management

Each transcoding session is uniquely identified and managed:

```typescript
interface TranscodingSession {
  sessionId: string; // Unique identifier (sceneId_startTime)
  sceneId: string; // Source video identifier
  startTime: number; // Seek position in seconds
  userId: string; // User identifier
  status: "starting" | "active" | "completed" | "error";
  qualities: string[]; // Available quality levels ['720p', '480p', '360p']
  processes: Map<string, ChildProcess>; // Active FFmpeg processes
  lastAccess: Date; // For cleanup scheduling
  scene?: Scene; // Cached scene metadata
}
```

### Session Lifecycle

1. **Creation**: New session created when user requests transcoded playback
2. **Processing**: Multiple FFmpeg processes spawn for different quality levels
3. **Monitoring**: Real-time status tracking and process management
4. **Cleanup**: Automatic cleanup after inactivity timeout (30 minutes)

### Concurrency Model

- **1 session per user per video** at any given start time
- **Multiple quality streams** per session (720p, 480p, 360p)
- **Automatic quality switching** based on bandwidth
- **Session reuse** for same video/position combinations

### FFmpeg Configuration

#### Master Playlist Generation

```bash
ffmpeg -ss ${startTime} -i "${inputFile}" \
  -c:v libx264 -c:a aac \
  -preset fast -crf 23 \
  -f hls -hls_time 4 -hls_list_size 0 \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -hls_segment_filename "${outputDir}/stream_%v/segment_%03d.ts" \
  "${outputDir}/stream_%v/playlist.m3u8"
```

#### Quality Profiles

- **720p**: 2500k video bitrate, 128k audio
- **480p**: 1000k video bitrate, 96k audio
- **360p**: 500k video bitrate, 64k audio

### Direct Play vs Transcoding

#### Direct Play (Preferred)

- **Criteria**: H.264 video codec + supported container (MP4, MKV, AVI)
- **Benefits**: Instant playback, no CPU usage, no storage overhead
- **Implementation**: Direct file serving via Express static routes

#### Adaptive Transcoding (Fallback)

- **Triggers**: Unsupported codecs, user preference, seeking requirements
- **Process**: On-demand HLS generation with multiple quality streams
- **Optimization**: Segment-based processing for faster startup

---

## API Documentation

### Core Endpoints

#### `GET /api/video/play`

Initiates video playback session

**Parameters:**

- `sceneId` (required): Video identifier
- `direct` (boolean): Force direct play mode
- `startTime` (number): Seek position in seconds
- `userId` (required): User identifier

**Response (Direct Play):**

```
Content-Type: video/mp4
[Binary video stream]
```

**Response (Transcoding):**

```json
{
  "success": true,
  "sessionId": "274_0_user1_1697123456",
  "playlistUrl": "/api/video/playlist/274_0_user1_1697123456/master.m3u8",
  "status": "starting",
  "scene": {
    "id": "274",
    "title": "Video Title",
    "duration": 1800,
    "files": [...],
    "studio": {...},
    "performers": [...],
    "tags": [...]
  }
}
```

#### `GET /api/video/playlist/:sessionId/master.m3u8`

Serves HLS master playlist for adaptive streaming

#### `GET /api/video/playlist/:sessionId/:quality/playlist.m3u8`

Serves quality-specific playlists

#### `GET /api/video/playlist/:sessionId/:quality/segment_:number.ts`

Serves individual video segments

#### `POST /api/video/seek`

Handles seeking within transcoded videos

```json
{
  "sessionId": "274_0_user1_1697123456",
  "startTime": 300
}
```

#### `DELETE /api/video/session/:sessionId`

Terminates transcoding session and cleanup

### Error Handling

#### Common Error Codes

- **404**: Video not found or file missing
- **500**: Transcoding failure or server error
- **400**: Invalid parameters
- **408**: Request timeout (5 second limit for Stash API)

#### Timeout Protection

All Stash API calls wrapped with 5-second timeout:

```typescript
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
};
```

---

## File Management & Cleanup

### Directory Structure

```
/app/tmp/segments/
├── 274_0_user1_1697123456/          # Session directory
│   ├── master.m3u8                  # Master playlist
│   ├── stream_0/                    # 720p quality
│   │   ├── playlist.m3u8
│   │   ├── segment_000.ts
│   │   ├── segment_001.ts
│   │   └── ...
│   ├── stream_1/                    # 480p quality
│   └── stream_2/                    # 360p quality
└── 275_120_user2_1697123500/        # Another session
    └── ...
```

### Cleanup System

#### Automatic Cleanup Triggers

1. **Inactivity Timeout**: 30 minutes without access
2. **Process Termination**: When FFmpeg processes complete
3. **Session Deletion**: Manual session termination
4. **Server Restart**: Cleanup all orphaned processes and files

#### Cleanup Process

```typescript
// 1. Terminate all FFmpeg processes
session.processes.forEach((process) => {
  if (!process.killed) {
    process.kill("SIGTERM");
  }
});

// 2. Remove session files
const outputDir = path.join("/app/tmp/segments", sessionId);
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

// 3. Remove from active sessions
this.sessions.delete(sessionId);
```

#### Background Cleanup Jobs

- **Interval**: Every 5 minutes
- **Process**: Check all sessions for inactivity
- **Orphan Detection**: Clean up files without active sessions

### File Size Estimates

- **4-second segments**: ~500KB - 2MB per segment (quality dependent)
- **10-minute video**: ~75-300 segments per quality
- **Total per session**: 150-1800MB (3 qualities)
- **Concurrent sessions**: Multiply by active user count

---

## Frontend Theming System

### CSS Custom Properties Architecture

The theming system uses CSS custom properties for consistent, maintainable styling:

```css
:root {
  /* Core Colors */
  --bg-primary: #0f0f0f; /* Main background */
  --bg-secondary: #1a1a1a; /* Card backgrounds */
  --bg-card: #262626; /* Interactive elements */

  /* Text Colors */
  --text-primary: #ffffff; /* Main text */
  --text-secondary: #b3b3b3; /* Secondary text */
  --text-muted: #737373; /* Disabled/muted text */

  /* Accent Colors */
  --accent-primary: #3b82f6; /* Primary actions */
  --accent-secondary: #10b981; /* Success states */
  --accent-warning: #f59e0b; /* Warning states */
  --accent-error: #ef4444; /* Error states */

  /* Layout */
  --border-color: #404040; /* Borders and dividers */
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
```

### Component Theming Patterns

#### Consistent Color Usage

```jsx
// Always use CSS custom properties
<div style={{ backgroundColor: "var(--bg-card)" }}>
<h2 style={{ color: "var(--text-primary)" }}>
<span style={{ color: "var(--text-secondary)" }}>
```

#### Status Indicators

```css
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-success {
  background-color: var(--accent-secondary);
}
.status-warning {
  background-color: var(--accent-warning);
}
.status-error {
  background-color: var(--accent-error);
}
```

### Responsive Design System

#### Breakpoints

- **Mobile**: `max-width: 640px`
- **Tablet**: `max-width: 768px`
- **Desktop**: `min-width: 1024px`

#### Layout Patterns

```css
/* Mobile-first approach */
.grid {
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .grid.sm\\:grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .grid.lg\\:grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### Dark Theme Implementation

The current implementation uses a dark theme by default. Future light theme support would involve:

1. **Theme Toggle Component**
2. **CSS Variable Switching**
3. **Local Storage Persistence**
4. **System Preference Detection**

---

## Storage & Performance

### Temporary Storage Usage

#### Per-Session Storage

- **Average video (30 min)**: 500MB - 1.5GB per session
- **Peak quality (720p)**: ~2MB per 4-second segment
- **All qualities combined**: ~5MB per 4-second segment set

#### Storage Calculations

```typescript
// Rough estimates for planning
const segmentDuration = 4; // seconds
const videoDuration = 1800; // 30 minutes
const segmentCount = videoDuration / segmentDuration; // 450 segments

const storagePerSession = {
  "720p": segmentCount * 2, // 900MB
  "480p": segmentCount * 1, // 450MB
  "360p": segmentCount * 0.5, // 225MB
  total: segmentCount * 3.5, // ~1.6GB
};
```

#### Concurrent Session Limits

- **Recommended**: 5-10 concurrent transcoding sessions
- **Storage impact**: 8-16GB temporary storage per 10 sessions
- **CPU impact**: Each session uses 1-3 CPU cores during active transcoding
- **Memory**: ~100-200MB RAM per active session

### Performance Optimizations

#### Transcoding Optimizations

- **Fast preset**: Prioritizes encoding speed over file size
- **Segment-based**: Allows streaming while encoding
- **Quality-adaptive**: Multiple bitrates for network conditions
- **Hardware acceleration**: Can be enabled for supported systems

#### Caching Strategy

- **Scene metadata**: 5-minute in-memory cache
- **File existence**: Cached checks for faster validation
- **Session reuse**: Existing sessions for same video/position

#### Network Optimizations

- **HLS segments**: 4-second chunks for responsive playback
- **Progressive loading**: Segments generated on-demand
- **Quality switching**: Automatic adaptation to bandwidth

---

## Future Improvements

### High Priority

#### 1. Enhanced User Experience

- **Playback Progress Sync**: Resume across sessions/devices
- **Quality Selection**: Manual quality override controls
- **Subtitle Support**: WebVTT subtitle rendering
- **Thumbnail Preview**: Seek position thumbnails
- **Watchlist/Favorites**: User preference management

#### 2. Performance & Scalability

- **Hardware Transcoding**: GPU acceleration (NVENC/VAAPI)
- **Distributed Processing**: Multi-server transcoding
- **CDN Integration**: Edge caching for segments
- **Database Integration**: Persistent session/progress storage
- **Load Balancing**: Multiple backend instances

#### 3. Advanced Features

- **Live Streaming**: Real-time transcoding support
- **Multi-audio**: Multiple audio track selection
- **Chapter Support**: Video chapter navigation
- **Playlist Management**: Queue and continuous play
- **Social Features**: Ratings, comments, sharing

### Medium Priority

#### 4. Developer Experience

- **API Documentation**: OpenAPI/Swagger specification
- **Unit Tests**: Comprehensive test coverage
- **Integration Tests**: End-to-end workflow testing
- **Docker Optimization**: Multi-stage builds, smaller images
- **Monitoring**: Prometheus metrics, health checks

#### 5. Security & Reliability

- **Authentication**: User login and access control
- **Rate Limiting**: API request throttling
- **Input Validation**: Robust parameter checking
- **Error Recovery**: Graceful failure handling
- **Backup Strategy**: Critical data protection

#### 6. Content Management

- **Batch Processing**: Multiple video import
- **Format Conversion**: Automatic optimization
- **Metadata Enhancement**: Automatic tagging
- **Storage Optimization**: Duplicate detection
- **Archive Management**: Long-term storage integration

### Low Priority

#### 7. Advanced Analytics

- **Usage Statistics**: View counts, popular content
- **Performance Metrics**: Transcoding efficiency
- **User Behavior**: Viewing patterns analysis
- **Quality Analytics**: Bitrate adaptation effectiveness
- **Cost Optimization**: Resource usage tracking

#### 8. Third-party Integrations

- **Plex Integration**: Alternative metadata source
- **Jellyfin Support**: Additional media server compatibility
- **Cloud Storage**: S3/Azure blob storage
- **Notification Systems**: Discord/Slack integration
- **External APIs**: TMDB, IMDB metadata enhancement

---

## Development Setup

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- FFmpeg (for transcoding)

### Environment Variables

```bash
# Required
STASH_URL=http://10.0.0.4:6969/graphql
STASH_API_KEY=your_stash_api_key

# Optional
CLEANUP_INTERVAL=300000        # 5 minutes
SESSION_TIMEOUT=1800000       # 30 minutes
MAX_CONCURRENT_SESSIONS=10    # Transcoding limit
```

### Quick Start

```bash
# Clone and start
git clone <repository>
cd stash-stream
docker-compose up --build -d

# Access
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
```

### Architecture Decisions

#### Why HLS over DASH?

- **Browser Support**: Better compatibility across devices
- **Simplicity**: Easier implementation and debugging
- **Apple Ecosystem**: Native iOS/Safari support

#### Why Session-based Architecture?

- **Resource Management**: Controlled concurrent processing
- **User Experience**: Seek support and quality switching
- **Cleanup**: Automatic resource reclamation

#### Why React + Video.js?

- **Mature Ecosystem**: Proven video playback libraries
- **Customization**: Extensive theming and plugin support
- **Performance**: Optimized for large-scale video delivery

---

## Troubleshooting

### Common Issues

#### Video Won't Play

1. Check Stash API connectivity
2. Verify file paths and permissions
3. Confirm FFmpeg installation
4. Check browser console for errors

#### Slow Transcoding

1. Monitor CPU usage during encoding
2. Consider hardware acceleration
3. Adjust quality settings
4. Check available disk space

#### Memory Issues

1. Monitor session cleanup
2. Reduce concurrent session limits
3. Check for memory leaks in Node.js
4. Restart containers periodically

### Debugging Tools

- **Browser DevTools**: Network tab for segment loading
- **Docker Logs**: `docker logs stash-stream-backend-1`
- **FFmpeg Logs**: Check transcoding process output
- **API Testing**: Use curl/Postman for endpoint testing

---

## Contributing

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Consistent formatting
- **Testing**: Jest for unit tests

### Pull Request Process

1. Fork repository
2. Create feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit pull request with description

---

_This documentation covers the current state of the Stash Stream application. For questions or contributions, please refer to the project repository._
