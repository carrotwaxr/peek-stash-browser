# 🛠️ Stash Player - Developer Documentation

This document provides comprehensive information for developers working on Stash Player, including setup, architecture, deployment, and contribution guidelines.

## 🏗️ Architecture Overview

### System Components

#### Development Architecture (Docker Compose)

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

#### Production Architecture (Single Container)

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

### Technology Stack

**Frontend**:

- React 18 + Hooks
- Tailwind CSS for styling
- Video.js for media playback
- React Router for navigation
- Custom theming system

**Backend**:

- Node.js + Express
- TypeScript for type safety
- Prisma ORM + SQLite
- JWT authentication
- FFmpeg integration
- stashapp-api GraphQL client

**Infrastructure**:

- **Development**: Docker Compose with hot reloading
- **Production**: Single-container deployment
- GitHub Actions CI/CD
- Health checks & monitoring

## 🚀 Development Setup

### Prerequisites

```bash
# Required software
- Node.js 18+
- Docker & Docker Compose
- Git
- Your favorite code editor

# Recommended tools
- VS Code with extensions:
  - ES7+ React/Redux/React-Native snippets
  - Tailwind CSS IntelliSense
  - Prisma
  - Docker
```

### Initial Setup

1. **Clone and setup repository**:

   ```bash
   git clone https://github.com/carrotwaxr/stash-player.git
   cd stash-player
   ```

2. **Environment configuration**:

   ```bash
   cp .env.example .env
   # Edit .env with your Stash server settings:
   # STASH_URL=http://your-stash-server:9999/graphql
   # STASH_API_KEY=your_api_key
   ```

3. **Start development environment with hot reloading**:

   ```bash
   # Starts both frontend and backend with hot reloading
   docker-compose up -d

   # SQLite database is automatically initialized
   # No separate database container needed!
   ```

4. **Access your development environment**:

   ```bash
   # Frontend with hot reloading: http://localhost:6969
   # Backend API: http://localhost:8000
   # Login: admin / admin (change immediately!)
   ```

5. **Making changes**:

   - **Frontend**: Edit files in `client/src/` → Browser refreshes automatically
   - **Backend**: Edit files in `server/` → Server restarts automatically
   - **Database**: Changes persist in SQLite file, no migrations needed for dev

### Development Environment Variables

```bash
# Database (SQLite - much simpler!)
DATABASE_URL="file:./data/stash-player.db"

# Stash Integration
STASH_URL="http://localhost:9999/graphql"
STASH_API_KEY="your_development_api_key"

# Storage
TMP_DIR="/path/to/temp/directory"

# Development
NODE_ENV="development"
JWT_SECRET="dev-secret-change-in-production"
```

### Development Workflow

1. **Feature development**:

   ```bash
   git checkout -b feature/your-feature-name
   # Make changes
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

2. **Testing**:

   ```bash
   # Frontend tests
   cd client && npm test

   # Backend tests
   cd server && npm test

   # Integration tests
   docker-compose -f docker-compose.test.yml up --abort-on-container-exit
   ```

3. **Code quality**:

   ```bash
   # Linting
   cd client && npm run lint
   cd server && npm run lint

   # Type checking
   cd server && npm run type-check

   # Formatting
   npm run format
   ```

## 🏛️ Codebase Structure

### Project Layout

```
stash-player/
├── client/                 # React frontend application
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API services
│   │   ├── utils/         # Utility functions
│   │   ├── themes/        # Theme configuration
│   │   └── contexts/      # React contexts
│   ├── package.json
│   └── vite.config.js
├── server/                # Node.js backend application
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic services
│   │   └── types/         # TypeScript type definitions
│   ├── prisma/           # Database schema and migrations
│   ├── package.json
│   └── tsconfig.json
├── docs/                  # Additional documentation
├── .github/workflows/     # CI/CD pipelines
├── docker-compose.yml     # Development environment
├── docker-compose.unraid.yml  # unRAID deployment
└── README.md
```

### Key Components

#### Frontend Architecture

**Component Structure**:

```
src/components/
├── ui/                    # Reusable UI components
│   ├── PageHeader.jsx
│   ├── LoadingSpinner.jsx
│   ├── FilterControls.jsx
│   └── Pagination.jsx
├── Layout.jsx             # Main layout wrapper
├── Navigation.jsx         # Navigation bar
├── Home.jsx              # Dashboard page
├── Scenes.jsx            # Scene list/grid
├── Performers.jsx        # Performer management
├── Studios.jsx           # Studio management
├── Tags.jsx              # Tag management
├── SceneGrid/            # Scene grid components
│   ├── SceneGrid.jsx
│   └── SceneGridItem.jsx
└── VideoPlayer.jsx       # Video playback component
```

**Hooks**:

```
src/hooks/
├── useApi.js             # Generic API hook
├── useAuth.js            # Authentication hook
├── useLibrary.js         # Stash library integration
├── useSortAndFilter.js   # Filtering and sorting
└── useAsyncData.js       # Async data fetching
```

**Services**:

```
src/services/
├── api.js                # API client and utilities
└── auth.js               # Authentication service
```

#### Backend Architecture

**Controllers**:

```
src/controllers/
├── auth.js               # Authentication endpoints
├── library.js            # Stash library proxying
└── video.js              # Video streaming logic
```

**Services**:

```
src/services/
├── TranscodingManager.js # FFmpeg transcoding
└── stash.js              # Stash API integration
```

**Database Schema**:

```sql
-- User management
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  ADMIN
  USER
}
```

## 🎥 Video Transcoding System

### Session Management

The transcoding system manages multiple concurrent sessions with different quality levels:

```typescript
interface TranscodingSession {
  sessionId: string; // Unique identifier
  sceneId: string; // Source video ID
  startTime: number; // Seek position
  userId: string; // User session
  status: SessionStatus; // Current status
  qualities: string[]; // Available qualities ['720p', '480p', '360p']
  processes: Map<string, ChildProcess>; // FFmpeg processes
  lastAccess: Date; // For cleanup
  outputDir: string; // Temp file location
  scene?: Scene; // Cached metadata
}

type SessionStatus = "starting" | "active" | "completed" | "error";
```

### FFmpeg Integration

**Quality Profiles**:

```javascript
const qualityProfiles = {
  "720p": {
    video: { bitrate: "2500k", scale: "1280:720" },
    audio: { bitrate: "128k" },
  },
  "480p": {
    video: { bitrate: "1000k", scale: "854:480" },
    audio: { bitrate: "96k" },
  },
  "360p": {
    video: { bitrate: "500k", scale: "640:360" },
    audio: { bitrate: "64k" },
  },
};
```

**HLS Generation**:

```bash
ffmpeg -ss ${startTime} -i "${inputFile}" \
  -c:v libx264 -c:a aac -preset fast -crf 23 \
  -f hls -hls_time 4 -hls_list_size 0 \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -hls_segment_filename "${outputDir}/stream_%v/segment_%03d.ts" \
  "${outputDir}/stream_%v/playlist.m3u8"
```

### Session Lifecycle

1. **Request** → Client requests video at specific timestamp
2. **Validation** → Check if session exists for same video/position
3. **Creation** → Spawn new session with unique ID
4. **Processing** → Start FFmpeg processes for each quality
5. **Monitoring** → Track process status and segment generation
6. **Streaming** → Serve HLS playlists and segments
7. **Cleanup** → Remove temporary files after timeout

### Video.js Configuration for HLS

**Key Configuration for VOD Behavior**:

```javascript
const videoJsOptions = {
  autoplay: true,
  controls: true,
  responsive: true,
  fluid: true,
  playbackRates: [0.5, 1, 1.25, 1.5, 2],
  html5: {
    vhs: {
      overrideNative: !videojs.browser.IS_SAFARI,
      enableLowInitialPlaylist: false, // Don't treat as live stream
      smoothQualityChange: true,
      useBandwidthFromLocalStorage: true,
      limitRenditionByPlayerDimensions: true,
      allowSeeksWithinUnsafeLiveWindow: true,
      handlePartialData: true,
    },
    nativeAudioTracks: false,
    nativeVideoTracks: false,
  },
  plugins: {
    qualityLevels: {}, // Enable quality selector
  },
};
```

**HLS Playlist Structure**:

```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
stream_0/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
stream_1/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
stream_2/playlist.m3u8
```

## 🔧 API Development

### Authentication Middleware

```typescript
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token =
    req.cookies.token || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired token" });
  }
};
```

### GraphQL Integration

**Stash API Client**:

```typescript
import { StashApi } from "stashapp-api";

const stash = new StashApi({
  url: process.env.STASH_URL!,
  apiKey: process.env.STASH_API_KEY!,
});

export const findScenes = async (
  filter: FindFilterType,
  sceneFilter: SceneFilterType
) => {
  const result = await stash.findScenes({
    filter,
    scene_filter: sceneFilter,
  });

  return result.findScenes;
};
```

### Library API Examples

The library endpoints provide powerful filtering and search capabilities. All endpoints accept JSON payloads:

**Scene Filtering**:

```javascript
// POST /api/library/scenes
{
  "filter": {
    "page": 1,
    "per_page": 25,
    "sort": "date",
    "direction": "DESC"
  },
  "scene_filter": {
    "rating100": {
      "modifier": "GREATER_THAN",
      "value": 80
    },
    "performer_favorite": true,
    "duration": {
      "modifier": "GREATER_THAN",
      "value": 300
    },
    "has_markers": "true"
  }
}
```

**Performer Filtering**:

```javascript
// POST /api/library/performers
{
  "filter": {
    "per_page": 50,
    "sort": "name"
  },
  "performer_filter": {
    "favorite": true,
    "gender": "FEMALE",
    "age": {
      "modifier": "GREATER_THAN",
      "value": 21
    },
    "birth_year": {
      "modifier": "BETWEEN",
      "value": 1990,
      "value2": 2000
    }
  }
}
```

**Studio Filtering**:

```javascript
// POST /api/library/studios
{
  "filter": {
    "q": "studio search",
    "per_page": 25
  },
  "studio_filter": {
    "name": {
      "modifier": "INCLUDES",
      "value": "Productions"
    },
    "scene_count": {
      "modifier": "GREATER_THAN",
      "value": 10
    }
  }
}
```

**Tag Filtering**:

```javascript
// POST /api/library/tags
{
  "filter": {
    "sort": "scene_count",
    "direction": "DESC"
  },
  "tag_filter": {
    "scene_count": {
      "modifier": "GREATER_THAN",
      "value": 5
    },
    "name": {
      "modifier": "MATCHES_REGEX",
      "value": "^(anal|oral).*"
    }
  }
}
```

### Error Handling

```typescript
// Global error handler
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("API Error:", err);

  if (err instanceof ValidationError) {
    return res
      .status(400)
      .json({ error: "Validation failed", details: err.details });
  }

  if (err instanceof AuthenticationError) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Default error response
  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { details: err.message }),
  });
};
```

## 🎨 Frontend Development

### Component Guidelines

**Functional Components with Hooks**:

```jsx
import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner, ErrorMessage } from "./ui";

const MyComponent = ({ initialData, onUpdate }) => {
  const { user } = useAuth();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Component logic
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return <div className="component-container">{/* Component JSX */}</div>;
};

export default MyComponent;
```

### Theming System

**Theme Context**:

```jsx
// themes/ThemeContext.js
export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
```

**CSS Variables**:

```css
/* themes/base.css */
:root {
  --background-primary: #1a1a1a;
  --background-secondary: #2d2d2d;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --primary-color: #3b82f6;
  --border-color: #404040;
}

[data-theme="light"] {
  --background-primary: #ffffff;
  --background-secondary: #f8f9fa;
  --text-primary: #212529;
  --text-secondary: #6c757d;
  --primary-color: #0d6efd;
  --border-color: #dee2e6;
}
```

### State Management

**Custom Hooks Pattern**:

```jsx
// hooks/useSortAndFilter.js
export const useSortAndFilter = (defaultSort, entityType) => {
  const [sort, setSort] = useState(defaultSort);
  const [sortDirection, setSortDirection] = useState("ASC");
  const [filters, setFilters] = useState({});
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const handleSortChange = useCallback((newSort, newDirection) => {
    setSort(newSort);
    setSortDirection(newDirection);
  }, []);

  const handleFilterChange = useCallback((filterName, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      Object.values(filters).some(
        (value) => value !== null && value !== undefined && value !== ""
      ),
    [filters]
  );

  return {
    sort,
    sortDirection,
    filters,
    isFilterPanelOpen,
    hasActiveFilters,
    handleSortChange,
    handleFilterChange,
    clearFilters,
    toggleFilterPanel: () => setIsFilterPanelOpen(!isFilterPanelOpen),
  };
};
```

## 🧪 Testing Strategy

### Unit Tests

**Frontend (Jest + React Testing Library)**:

```jsx
// __tests__/components/SceneGrid.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import SceneGrid from "../components/SceneGrid/SceneGrid";

describe("SceneGrid", () => {
  const mockScenes = [
    { id: "1", title: "Test Scene 1", duration: 1800 },
    { id: "2", title: "Test Scene 2", duration: 2400 },
  ];

  it("renders scenes correctly", () => {
    render(<SceneGrid scenes={mockScenes} />);

    expect(screen.getByText("Test Scene 1")).toBeInTheDocument();
    expect(screen.getByText("Test Scene 2")).toBeInTheDocument();
  });

  it("handles pagination", () => {
    const onPageChange = jest.fn();
    render(
      <SceneGrid
        scenes={mockScenes}
        totalCount={50}
        currentPage={1}
        onPageChange={onPageChange}
      />
    );

    fireEvent.click(screen.getByText("Next"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
```

**Backend (Jest + Supertest)**:

```javascript
// __tests__/controllers/auth.test.js
import request from "supertest";
import { app } from "../src/app";
import { PrismaClient } from "@prisma/client";

describe("Auth Endpoints", () => {
  let prisma;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /api/auth/login", () => {
    it("should authenticate valid user", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "admin@example.com",
        password: "admin",
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("token");
      expect(response.body.user.email).toBe("admin@example.com");
    });

    it("should reject invalid credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "admin@example.com",
        password: "wrong",
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });
  });
});
```

### Integration Tests

**Docker Compose Test Environment**:

```yaml
# docker-compose.test.yml
services:
  db-test:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: stashplayer_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test

  backend-test:
    build: ./server
    environment:
      NODE_ENV: test
      DATABASE_URL: postgresql://test:test@db-test:5432/stashplayer_test
    depends_on:
      - db-test
    command: npm test

  frontend-test:
    build: ./client
    command: npm test -- --watchAll=false
```

### Test Coverage

```bash
# Generate coverage reports
cd client && npm run test:coverage
cd server && npm run test:coverage

# View coverage
open coverage/lcov-report/index.html
```

## 🚀 Deployment & DevOps

### Docker Build Process

**Development Dockerfiles** (Hot Reloading):

```dockerfile
# server/Dockerfile.dev - Backend with nodemon
FROM node:18-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
CMD ["npm", "run", "dev"]  # nodemon for hot reloading
```

```dockerfile
# client/Dockerfile.dev - Frontend with Vite HMR
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]  # Vite dev server
```

**Production Dockerfile** (Single Container):

```dockerfile
# Dockerfile.production - Combined frontend + backend
FROM node:18-slim as frontend-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:18-slim as backend-build
WORKDIR /app/server
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm install
COPY server/prisma ./prisma
RUN npx prisma generate
COPY server/ ./
RUN npm run build

FROM node:18-slim as production
RUN apt-get update && apt-get install -y ffmpeg nginx && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy built backend
COPY --from=backend-build /app/server/dist ./backend/
COPY --from=backend-build /app/server/node_modules ./node_modules/
COPY --from=backend-build /app/server/prisma ./prisma/

# Copy built frontend
COPY --from=frontend-build /app/client/dist ./frontend/

# Configure nginx to serve frontend + proxy API
RUN echo 'server { listen 80; location / { root /app/frontend; try_files $uri $uri/ /index.html; } location /api/ { proxy_pass http://localhost:8000; } }' > /etc/nginx/conf.d/default.conf

# Create startup script
RUN echo '#!/bin/bash\nnginx\nexport DATABASE_URL="file:/app/data/stash-player.db"\ncd /app\nnpx prisma db push --accept-data-loss\nnode backend/index.js' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 80
CMD ["/app/start.sh"]
```

### CI/CD Pipeline

**GitHub Actions Workflow**:

```yaml
# .github/workflows/docker-build.yml
name: Build and Push Docker Images

on:
  push:
    branches: [main, master]
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./server
          push: true
          tags: |
            ghcr.io/${{ github.repository }}-backend:latest
            ghcr.io/${{ github.repository }}-backend:${{ github.sha }}

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./client
          push: true
          tags: |
            ghcr.io/${{ github.repository }}-frontend:latest
            ghcr.io/${{ github.repository }}-frontend:${{ github.sha }}
```

### Environment-Specific Deployments

**Production Docker Compose**:

```yaml
# docker-compose.prod.yml
services:
  frontend:
    image: ghcr.io/carrotwaxr/stash-player-frontend:latest
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    image: ghcr.io/carrotwaxr/stash-player-backend:latest
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file: .env.production
    volumes:
      - ${MEDIA_PATH}:/app/media:ro
      - ${TMP_PATH}:/app/tmp
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    env_file: .env.production
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Health Monitoring

**Health Check Endpoints**:

```typescript
// Health check implementation
app.get("/api/health", async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check Stash connectivity
    const stashHealth = await fetch(`${process.env.STASH_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });

    const status = stashHealth.ok ? "healthy" : "degraded";

    res.json({
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: "healthy",
        stash: stashHealth.ok ? "healthy" : "error",
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});
```

## 📊 Performance Optimization

### Frontend Optimization

**Code Splitting**:

```jsx
import { lazy, Suspense } from "react";

const Scenes = lazy(() => import("./components/Scenes"));
const Performers = lazy(() => import("./components/Performers"));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/scenes" element={<Scenes />} />
        <Route path="/performers" element={<Performers />} />
      </Routes>
    </Suspense>
  );
}
```

**Image Optimization**:

```jsx
const OptimizedImage = ({ src, alt, className }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative ${className}`}>
      {!loaded && <div className="animate-pulse bg-gray-300" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
      />
    </div>
  );
};
```

### Backend Optimization

**Database Query Optimization**:

```typescript
// Use select to limit fields
const scenes = await prisma.scene.findMany({
  select: {
    id: true,
    title: true,
    duration: true,
    rating: true,
    performers: {
      select: {
        id: true,
        name: true,
      },
    },
  },
  take: 24,
  skip: (page - 1) * 24,
  orderBy: { createdAt: "desc" },
});

// Use database-level filtering
const filteredScenes = await prisma.scene.findMany({
  where: {
    AND: [
      { rating: { gte: minRating } },
      { performers: { some: { id: { in: performerIds } } } },
    ],
  },
});
```

**Caching Strategy**:

```typescript
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

export const getCachedData = async (
  key: string,
  fetchFn: () => Promise<any>
) => {
  let data = cache.get(key);

  if (!data) {
    data = await fetchFn();
    cache.set(key, data);
  }

  return data;
};

// Usage
const scenes = await getCachedData(`scenes:${page}:${filters}`, async () => {
  return await stash.findScenes({ filter, scene_filter: sceneFilter });
});
```

## 🔒 Security Best Practices

### Authentication & Authorization

**JWT Security**:

```typescript
// Secure JWT configuration
const jwtOptions = {
  expiresIn: "24h",
  issuer: "stash-player",
  audience: "stash-player-users",
  algorithm: "HS256",
};

// Refresh token rotation
export const refreshToken = async (refreshToken: string) => {
  const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET!);
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

  if (!user) throw new Error("Invalid refresh token");

  // Issue new access token and refresh token
  const newAccessToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET!,
    jwtOptions
  );
  const newRefreshToken = jwt.sign(
    { userId: user.id },
    process.env.REFRESH_SECRET!,
    { expiresIn: "7d" }
  );

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};
```

**Input Validation**:

```typescript
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    loginSchema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid input", details: error.errors });
  }
};
```

### File Security

**Path Traversal Protection**:

```typescript
import path from "path";

export const sanitizeFilePath = (filePath: string): string => {
  // Remove any path traversal attempts
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(normalized);

  // Ensure file is within allowed directory
  if (!resolved.startsWith(process.env.MEDIA_ROOT!)) {
    throw new Error("Access denied");
  }

  return resolved;
};
```

### Environment Security

```bash
# Production environment variables
NODE_ENV=production
JWT_SECRET=your-very-long-random-secret-key
REFRESH_SECRET=another-very-long-random-secret-key
POSTGRES_PASSWORD=secure-database-password
STASH_API_KEY=secure-stash-api-key

# Security headers
HELMET_ENABLED=true
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

## 📋 Code Style & Standards

### TypeScript Guidelines

```typescript
// Use strict typing
interface User {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
  createdAt: Date;
}

// Prefer type guards
const isUser = (obj: any): obj is User => {
  return (
    obj &&
    typeof obj.id === "string" &&
    typeof obj.email === "string" &&
    ["ADMIN", "USER"].includes(obj.role)
  );
};

// Use utility types
type CreateUserRequest = Omit<User, "id" | "createdAt">;
type UpdateUserRequest = Partial<Pick<User, "email" | "role">>;
```

### React Guidelines

```jsx
// Props interface
interface SceneCardProps {
  scene: Scene;
  onPlay: (sceneId: string) => void;
  className?: string;
}

// Default props with destructuring
const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  onPlay,
  className = "",
}) => {
  const handleClick = useCallback(() => {
    onPlay(scene.id);
  }, [scene.id, onPlay]);

  return (
    <div className={`scene-card ${className}`} onClick={handleClick}>
      {/* Component content */}
    </div>
  );
};

export default SceneCard;
```

### CSS/Tailwind Guidelines

```jsx
// Use semantic class names
const buttonClasses = {
  base: "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2",
  variants: {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary:
      "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  },
};

const Button = ({ variant = "primary", children, ...props }) => (
  <button
    className={`${buttonClasses.base} ${buttonClasses.variants[variant]}`}
    {...props}
  >
    {children}
  </button>
);
```

## 🐛 Debugging & Troubleshooting

### Logging Strategy

```typescript
// Structured logging
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" }),
  ],
});

// Usage
logger.info("User logged in", { userId: user.id, timestamp: new Date() });
logger.error("Database connection failed", {
  error: error.message,
  stack: error.stack,
});
```

### Development Tools

**Hot Reload Setup**:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "dev:db": "docker-compose up -d db"
  }
}
```

**Debug Configuration** (VS Code):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server/src/index.ts",
      "env": {
        "NODE_ENV": "development"
      },
      "runtimeArgs": ["-r", "ts-node/register"],
      "console": "integratedTerminal"
    }
  ]
}
```

## 🚀 Publishing & Distribution

### Docker Registry Publishing

```bash
# Build multi-architecture images
docker buildx create --use --name multiarch
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/carrotwaxr/stash-player-backend:latest \
  --push ./server

# Tag versions
docker tag ghcr.io/carrotwaxr/stash-player-backend:latest \
  ghcr.io/carrotwaxr/stash-player-backend:v1.0.0
```

### Release Process

1. **Version Bump**:

   ```bash
   npm version minor  # or patch/major
   git push --tags
   ```

2. **Automated Release** (GitHub Actions):

   ```yaml
   - name: Create Release
     uses: actions/create-release@v1
     with:
       tag_name: ${{ github.ref }}
       release_name: Release ${{ github.ref }}
       draft: false
       prerelease: false
   ```

3. **Documentation Update**:
   - Update CHANGELOG.md
   - Update version in docker-compose files
   - Update unRAID template
   - Test deployment process

### Community Distribution

**unRAID Community Apps**:

1. Fork [docker-templates](https://github.com/Squidly271/docker-templates)
2. Add template to appropriate category
3. Submit pull request
4. Respond to feedback and testing

**Docker Hub**:

1. Create repository with detailed README
2. Set up automated builds from GitHub
3. Tag with proper semantic versions
4. Maintain compatibility matrix

## 🤝 Contributing Guidelines

### Getting Started

1. **Fork & Clone**:

   ```bash
   git clone https://github.com/your-username/stash-player.git
   cd stash-player
   git remote add upstream https://github.com/carrotwaxr/stash-player.git
   ```

2. **Set up development environment** (see Development Setup section)

3. **Create feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Pull Request Process

1. **Before submitting**:

   - Write tests for new functionality
   - Update documentation if needed
   - Run linting and type checking
   - Test in multiple browsers/environments

2. **PR Guidelines**:

   - Clear, descriptive title
   - Detailed description of changes
   - Link to related issues
   - Include screenshots for UI changes

3. **Code Review**:
   - Address all feedback
   - Keep changes focused and atomic
   - Squash commits before merge

### Issue Guidelines

**Bug Reports**:

- Use the bug report template
- Include reproduction steps
- Provide environment details
- Include logs/screenshots

**Feature Requests**:

- Use the feature request template
- Explain use case and benefits
- Consider implementation complexity
- Be open to alternative solutions

## 📚 Additional Resources

### Documentation

- [Stash API Documentation](https://github.com/stashapp/stash/blob/develop/docs/GRAPHQL.md)
- [React Documentation](https://reactjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Docker Documentation](https://docs.docker.com/)

### Community

- [Stash Discord](https://discord.gg/2TsNFKt)
- [unRAID Forums](https://forums.unraid.net/)
- [GitHub Discussions](https://github.com/carrotwaxr/stash-player/discussions)

### Tools & Extensions

- [stashapp-api](https://github.com/carrotwaxr/stashapp-api) - TypeScript GraphQL client
- [Stash Plugins](https://github.com/stashapp/CommunityScripts) - Community plugins
- [unRAID Templates](https://github.com/Squidly271/docker-templates) - Template repository
