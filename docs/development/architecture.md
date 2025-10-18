# Architecture Overview

This document describes the technical architecture of Peek Stash Browser, including system components, technology stack, and data flow.

## System Components

### Development Architecture

In development mode, Peek runs as separate frontend and backend containers with hot reloading enabled:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │────│  Node.js Server  │────│  Stash GraphQL  │
│  (Vite HMR)     │    │   (nodemon)      │    │     (API)       │
│   Port 5173     │    │   Port 8000      │    │   Port 9999     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │
         │              ┌─────────────────┐
         │              │     SQLite      │
         └──────────────│   Database      │──────────────
                        │ (Hot Reloading) │
                        └─────────────────┘
                        ┌─────────────────┐
                        │     FFmpeg      │
                        │   Transcoding   │
                        └─────────────────┘
```

**Key Features**:
- Frontend: Vite dev server with Hot Module Replacement (HMR)
- Backend: Nodemon for automatic server restarts on code changes
- Database: SQLite with persistence across restarts
- Video: FFmpeg for real-time HLS transcoding

### Production Architecture

In production, Peek runs as a single Docker container with Nginx serving the frontend and proxying API requests to the backend:

```
┌──────────────────────────────────────────────┐
│              Docker Container                │
│  ┌─────────────────┐  ┌──────────────────┐   │    ┌─────────────────┐
│  │     nginx       │──│  Node.js Server  │───┼────│  Stash GraphQL  │
│  │ (Static Files)  │  │   (Express API)  │   │    │     (API)       │
│  │   Port 80       │  │   Port 8000      │   │    │   Port 9999     │
│  └─────────────────┘  └──────────────────┘   │    └─────────────────┘
│           │                      │            │
│           │            ┌─────────────────┐    │
│           │            │     SQLite      │    │
│           └────────────│   Database      │────│
│                        │   (Embedded)    │    │
│                        └─────────────────┘    │
│                        ┌─────────────────┐    │
│                        │     FFmpeg      │    │
│                        │   Transcoding   │    │
│                        └─────────────────┘    │
└──────────────────────────────────────────────┘
```

**Key Features**:
- Single container for simplified deployment
- Nginx serves static files and proxies API requests
- SQLite embedded database (no separate container)
- FFmpeg for video transcoding

## Technology Stack

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19 | UI framework with Hooks API |
| **Vite** | 6 | Build tool and dev server |
| **Tailwind CSS** | 3 | Utility-first CSS framework |
| **Video.js** | 8 | HTML5 video player for HLS streaming |
| **React Router** | 6 | Client-side routing |
| **Axios** | 1.x | HTTP client |

**Frontend Features**:
- Custom theming system with dark/light modes
- Responsive grid layouts for scenes/performers
- Lazy loading and code splitting for optimal performance
- Custom React hooks for data fetching and state management

### Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18+ | JavaScript runtime |
| **Express** | 4 | Web framework |
| **TypeScript** | 5 | Type safety and developer experience |
| **Prisma** | 6 | ORM and database toolkit |
| **SQLite** | 3 | Embedded database |
| **JWT** | 9 | Authentication tokens |
| **FFmpeg** | 6+ | Video transcoding |

**Backend Features**:
- RESTful API with JWT authentication
- GraphQL client for Stash integration (stashapp-api)
- Session-based FFmpeg transcoding management
- Prisma schema migrations

### Infrastructure

**Development**:
- Docker Compose with hot reloading for frontend and backend
- Volume mounts for source code (live updates)
- SQLite database with persistent volume

**Production**:
- Single-container deployment with multi-stage Docker build
- Nginx reverse proxy configuration
- Health checks and monitoring endpoints
- GitHub Actions CI/CD pipeline

## Project Structure

```
peek-stash-browser/
├── client/                 # React frontend application
│   ├── public/            # Static assets (favicon, logos)
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── pages/    # Page-level components
│   │   │   ├── scene-search/  # Scene grid and search UI
│   │   │   ├── ui/       # Reusable UI components
│   │   │   ├── video-player/  # Video player components
│   │   │   ├── branding/ # Logo and branding
│   │   │   └── icons/    # Icon components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API client services
│   │   ├── utils/        # Utility functions
│   │   ├── themes/       # Theme configuration
│   │   └── contexts/     # React contexts (Auth, Theme)
│   ├── package.json
│   └── vite.config.js
├── server/                # Node.js backend application
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic services
│   │   │   └── TranscodingManager.ts  # FFmpeg management
│   │   ├── utils/         # Utility functions
│   │   └── types/         # TypeScript type definitions
│   ├── prisma/           # Database schema and migrations
│   ├── package.json
│   └── tsconfig.json
├── docs/                  # MkDocs documentation
├── .github/workflows/     # CI/CD pipelines
├── docker-compose.yml     # Development environment
└── Dockerfile.production  # Production build
```

## Component Architecture

### Frontend Components

**Component Hierarchy**:

```
App (Router, Auth, Theme)
├── Layout
│   ├── Navigation
│   └── Page Content
│       ├── Home (Dashboard)
│       ├── Scenes (Scene Grid + Filters)
│       ├── Scene Detail (Video Player)
│       ├── Performers (Grid + Filters)
│       ├── Studios (Grid + Filters)
│       ├── Tags (Grid + Filters)
│       └── Settings (User Preferences)
└── Common Components
    ├── PageHeader
    ├── LoadingSpinner
    ├── FilterControls
    ├── Pagination
    └── ErrorMessage
```

**Key Components**:

| Component | Location | Purpose |
|-----------|----------|---------|
| `App.jsx` | `src/App.jsx` | Root component with routing |
| `Layout.jsx` | `src/components/Layout.jsx` | Page layout wrapper |
| `Navigation.jsx` | `src/components/Navigation.jsx` | Navigation bar |
| `SceneSearch.jsx` | `src/components/scene-search/` | Scene grid with filtering |
| `VideoPlayer.jsx` | `src/components/video-player/` | Video.js player component |
| `FilterControls.jsx` | `src/components/ui/` | Reusable filter UI |

**Custom Hooks**:

| Hook | Location | Purpose |
|------|----------|---------|
| `useApi.js` | `src/hooks/` | Generic API data fetching |
| `useAuth.js` | `src/hooks/` | Authentication state management |
| `useLibrary.js` | `src/hooks/` | Stash library integration |
| `useSortAndFilter.js` | `src/hooks/` | Filtering and sorting logic |

### Backend Architecture

**API Routes**:

```
/api
├── /auth
│   ├── POST /login      # Authenticate user
│   ├── POST /logout     # End session
│   └── POST /register   # Create new user
├── /library
│   ├── POST /scenes     # Search/filter scenes
│   ├── POST /performers # Search/filter performers
│   ├── POST /studios    # Search/filter studios
│   └── POST /tags       # Search/filter tags
├── /video
│   ├── GET  /session/:sessionId/master.m3u8  # HLS master playlist
│   ├── GET  /session/:sessionId/:quality/playlist.m3u8  # Quality playlist
│   └── GET  /session/:sessionId/:quality/segment_:num.ts  # Video segment
└── /health              # Health check endpoint
```

**Controllers**:

| Controller | Location | Purpose |
|------------|----------|---------|
| `auth.js` | `src/controllers/` | Authentication endpoints |
| `library.js` | `src/controllers/` | Stash library proxying |
| `video.js` | `src/controllers/` | Video streaming and transcoding |

**Services**:

| Service | Location | Purpose |
|---------|----------|---------|
| `TranscodingManager.ts` | `src/services/` | FFmpeg session management |
| `stash.js` | `src/services/` | Stash GraphQL API client |

## Database Schema

### User Model

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   # Bcrypt hashed
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  ADMIN
  USER
}
```

**Future Models** (Planned):
- Playlist
- PlaylistItem
- UserPreferences
- WatchHistory

## Security Architecture

### Authentication

- **JWT-based authentication** with HttpOnly cookies
- **Bcrypt password hashing** (10 rounds)
- **Role-based access control** (Admin/User roles)
- **Token expiration** (24 hours, configurable)

### Authorization

- **Middleware-based auth checks** on protected routes
- **User ownership validation** for user-specific resources
- **Admin-only endpoints** for user management

### File Security

- **Path sanitization** to prevent directory traversal
- **Read-only media mounts** in production
- **Temporary file cleanup** after transcoding sessions
- **Session isolation** (one user can't access another's session)

## Performance Considerations

### Frontend Optimization

- **Code splitting**: All page components lazy-loaded
- **Bundle optimization**: Vendor chunks for React, Video.js, UI libraries
- **Image lazy loading**: Native `loading="lazy"` attribute
- **Memoization**: React.memo and useMemo for expensive computations

### Backend Optimization

- **Session reuse**: Reuse transcoding sessions when seeking nearby
- **Segment caching**: Keep transcoded segments until session cleanup
- **Database indexing**: Indexes on frequently queried fields
- **Connection pooling**: Prisma connection pool for database

### Video Transcoding

- **Quality presets**: 720p, 480p, 360p with optimized bitrates
- **Fast start encoding**: `-movflags +faststart` for MP4
- **HLS segmentation**: 4-second segments for smooth playback
- **Smart seeking**: FFmpeg `-ss` before `-i` for efficient seeking

## Monitoring and Health Checks

### Health Check Endpoint

```typescript
GET /api/health

Response:
{
  "status": "healthy",
  "timestamp": "2025-10-17T12:00:00Z",
  "services": {
    "database": "healthy",
    "stash": "healthy"
  }
}
```

### Logging

- **Winston logger** for structured backend logging
- **Video.js log level**: Set to `warn` to reduce console spam
- **FFmpeg output parsing**: Error detection and logging

## Scalability Considerations

### Current Limitations

- **Single-server architecture**: No horizontal scaling
- **Local file storage**: Media must be accessible on same server
- **In-memory sessions**: Sessions lost on server restart

### Future Enhancements

- **Redis session storage**: Persist sessions across restarts
- **CDN integration**: Serve static files and HLS segments from CDN
- **Database migration**: PostgreSQL for multi-server deployments
- **Load balancing**: Support multiple backend instances

## Next Steps

- [Video System Details](video-system.md)
- [API Reference](api-reference.md)
- [Testing Guide](testing.md)
