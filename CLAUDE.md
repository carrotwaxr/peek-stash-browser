# Peek Stash Browser

Web application for browsing and streaming Stash media with HLS transcoding, playlists, and multi-user support.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Video.js 8
- **Backend**: Node.js/Express, TypeScript (strict), Prisma 6, SQLite
- **Video**: FFmpeg for real-time HLS transcoding (360p-1080p)
- **Deployment**: Docker (dev: docker-compose, prod: single container + Nginx)
- **Dependency**: `stashapp-api` npm package for Stash GraphQL queries

## Development

```bash
# Start dev environment (recommended)
docker-compose up --build -d

# View logs
docker-compose logs -f peek-server
docker-compose logs -f peek-client

# Linting
cd client && npm run lint
cd server && npm run lint

# Tests
cd client && npm test
cd server && npm test
```

The app requires Docker for FFmpeg and path mapping. Direct Node.js (`npm run dev`) works for quick validation but isn't fully functional.

## Architecture

### Video Transcoding (server/services/TranscodingManager.ts)
- Session-based: one FFmpeg process per quality per scene
- VOD trick: generates full playlist immediately for seek bar
- Segment renaming: FFmpeg outputs segment_000.ts, renamed to match timeline position
- Smart seeking: reuses sessions when possible, preserves segments on restart
- Auto-cleanup after 90 seconds of inactivity

### Path Mapping (server/utils/pathMapping.ts)
- Translates Stash internal paths to Peek container paths
- Configured via Setup Wizard, stored in database PathMapping table
- Example: Stash `/data/videos/scene.mp4` → Peek `/app/media/videos/scene.mp4`

### Authentication
- JWT in HTTP-only cookies (24h expiry)
- Roles: ADMIN, USER
- Middleware: `authenticateToken`, `requireAdmin`, `requireCacheReady`

### Stash Integration
- Uses `stashapp-api` singleton via `getStash()`
- Cache: StashCacheManager fetches all entities on startup, refreshes hourly
- All Stash image URLs proxied via `/api/proxy/stash` to hide API key

## Database

**Always use migrations, never `prisma db push`.**

```bash
cd server
npx prisma migrate dev --name descriptive_name  # Create migration
npx prisma migrate deploy                        # Apply (production)
```

Key models: User, WatchHistory, Playlist, PlaylistItem, *Rating tables, PathMapping

## Release Process

Use `/publish-peek` command. Workflow:
1. Bump version in both client/package.json and server/package.json
2. Commit version bump to main
3. Create and push git tag (e.g., v1.5.3)
4. GitHub Actions builds Docker image and creates release

## Key Files

**Frontend**: `client/src/components/video-player/VideoPlayer.jsx`, `client/src/services/api.js`
**Backend**: `server/services/TranscodingManager.ts`, `server/controllers/video.ts`, `server/controllers/library.ts`
**Config**: `docker-compose.yml`, `Dockerfile.production`, `server/prisma/schema.prisma`

## Environment Variables

Required: `STASH_URL`, `STASH_API_KEY`, `DATABASE_URL`, `JWT_SECRET`
Optional: `CONFIG_DIR`, `STASH_INTERNAL_PATH`, `STASH_MEDIA_PATH`

## Integration Testing

Integration tests run against a real Stash server to validate API functionality.

**Setup (first time):**
1. Ensure `.env` has `STASH_URL` and `STASH_API_KEY`
2. Copy `server/integration/fixtures/testEntities.example.ts` to `testEntities.ts`
3. Fill in entity IDs from your Stash library

**Running tests:**
- `cd server && npm run test:integration` - Run against persistent test DB
- `cd server && npm run test:integration:fresh` - Reset DB and test setup flow
- `cd server && npm run test:integration:watch` - Watch mode for development

**Pre-release validation:**
Run `/pre-release` to execute all checks before tagging a release.

## Issue Tracking

- GitHub: https://github.com/carrotwaxr/peek-stash-browser/issues
- Discourse: https://discourse.stashapp.cc/t/peek-stash-browser/4018
