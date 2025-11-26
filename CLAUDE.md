# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Peek Stash Browser** is a modern web application for browsing and streaming Stash (adult content library manager) media with adaptive video transcoding, playlists, and watch history. The application integrates with Stash's GraphQL API while providing its own user management, preferences, and playback features.

**Current Version**: 1.5.2 (client and server in sync)

**Tech Stack**:
- Frontend: React 19 (with Babel React Compiler), Vite, Tailwind CSS, Video.js 8
- Backend: Node.js/Express + TypeScript (ES2020, strict mode), Prisma 6, SQLite
- Video: FFmpeg for HLS transcoding with quality presets (360p-1080p)
- Deployment: Docker (dev: docker-compose, prod: single container with Nginx)

**Dependency**: Consumes `stashapp-api` npm package (v0.3.18) for type-safe Stash GraphQL queries

## Development Commands

### Starting Development Environment

**Recommended - Docker Compose** (full-stack with hot reload):
```bash
# From project root
docker-compose up --build -d

# View logs
docker-compose logs -f peek-server   # Backend logs
docker-compose logs -f peek-client   # Frontend logs

# Restart after major changes
docker-compose restart peek-server
docker-compose restart peek-client
```

**Direct Node.js** (for quick validation only, not fully functional):
```bash
# Backend (port 8000)
cd server && npm run dev

# Frontend (port 5173)
cd client && npm run dev
```

**Note**: The app requires Docker for proper operation due to FFmpeg dependencies and path mapping.

### Building for Production

```bash
# Frontend build
cd client && npm run build

# Backend build (TypeScript compilation)
cd server && npm run build

# Production Docker image (optimized, multi-stage build)
docker build -f Dockerfile.production -t peek-stash-browser:latest .
```

### Testing

**Run tests** (Vitest):
```bash
# Client tests
cd client && npm test              # Watch mode
cd client && npm run test:run      # Run once
cd client && npm run test:coverage # With coverage

# Server tests
cd server && npm test
cd server && npm run test:run
cd server && npm run test:coverage
```

**Current test coverage**: Limited unit tests exist in `client/src/utils/__tests__/` for filter configurations. More coverage needed.

### Linting and Formatting

```bash
# Lint
cd client && npm run lint
cd server && npm run lint

# Format
cd client && npm run format        # Write
cd client && npm run format:check  # Check only
cd server && npm run format
cd server && npm run format:check
```

### Code Analysis and Quality Tools

**Code analysis** (find unused dependencies, exports, files):
```bash
# Run both depcheck + knip
cd client && npm run analyze
cd server && npm run analyze

# Individual tools
cd client && npm run depcheck  # Find unused dependencies
cd client && npm run knip       # Find unused files/exports/types
```

**Configuration files**:
- `client/knip.json`, `server/knip.json` - Knip entry points and ignore rules
- `client/.depcheckrc.json`, `server/.depcheckrc.json` - Depcheck ignore patterns

**Common findings** (may be false positives):
- Dynamic imports not detected by static analysis
- Route handlers registered dynamically
- Exports intended for external API consumers
- Types used only in JSDoc comments

**Workflow**: Run `npm run analyze` periodically to catch dead code accumulation. Review findings carefully before removing - test thoroughly after changes.

### Database Management

**CRITICAL: Always use proper migrations. Never use `prisma db push` in production.**

```bash
# Create a new migration (development only)
cd server && npx prisma migrate dev --name descriptive_name

# Apply pending migrations (production)
cd server && npx prisma migrate deploy

# Generate Prisma client (after schema changes)
cd server && npx prisma generate

# Reset database (DESTRUCTIVE - development only)
cd server && npx prisma migrate reset

# View database in Prisma Studio
cd server && npx prisma studio

# Check migration status
cd server && npx prisma migrate status
```

**Migration workflow for schema changes:**
1. Edit `server/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name` - creates migration SQL and applies it
3. Commit both `schema.prisma` AND the new migration folder in `prisma/migrations/`
4. The Docker startup script (`docker/start.sh`) runs `prisma migrate deploy` to apply migrations

**WARNING**: Never use `prisma db push` for production databases. It doesn't create migration files and can cause data loss with `--accept-data-loss`. The baseline migration (`0_baseline`) was created to fix databases that were incorrectly managed with `db push`.

## Architecture Overview

### Video Transcoding System

The `TranscodingManager` ([server/services/TranscodingManager.ts](server/services/TranscodingManager.ts)) implements **continuous HLS streaming**:

- **Session-based**: One FFmpeg process per quality level per scene (keyed by `sceneId_quality`)
- **Quality presets**: 360p, 480p, 720p, 1080p with configurable bitrates
- **VOD trick**: Pre-generates full playlist (all segments 0-617) immediately for timeline controls
- **Segment renaming**: FFmpeg outputs `segment_000.ts`, we rename to match timeline position (e.g., `segment_306.ts` when starting at 1232s)
- **Smart seeking**: Reuses sessions when possible; on far seeks, restarts FFmpeg and preserves already-transcoded segments via `fs.renameSync()` (move, not copy)
- **Auto-cleanup**: Sessions terminate after 90 seconds of inactivity
- **Retry logic**: Failed segments tracked with retry count (max 3 attempts)

**Important**: This is NOT per-segment transcoding. Each session runs a single continuous FFmpeg process that outputs segments as playback progresses.

### Path Mapping System

Handles flexible path translation between Stash's internal Docker paths and Peek's access paths ([server/utils/pathMapping.ts](server/utils/pathMapping.ts)):

- **Primary source**: Database `PathMapping` table (supports multiple libraries)
- **Fallback**: Environment variables `STASH_INTERNAL_PATH`/`STASH_MEDIA_PATH` (legacy)
- **Algorithm**: Longest prefix match (sorted by path length descending)
- **Examples**:
  - Stash Docker `/data/videos/scene.mp4` → Peek `/app/media/videos/scene.mp4`
  - Stash Windows `C:\Videos\scene.mp4` → Peek `/app/media/scene.mp4`
- **URL proxying**: All Stash image URLs converted to `/api/proxy/stash?path=...` to prevent API key exposure

### Authentication & Authorization

JWT-based authentication with role-based access control:

- **Token**: 24-hour expiry, stored in HTTP-only cookie (XSS protection)
- **Roles**: `ADMIN` and `USER` (defined in Prisma schema)
- **Middleware stack**:
  1. `authenticateToken` - Validates JWT and attaches user to `req.user`
  2. `requireCacheReady` - Ensures Stash cache is initialized
  3. `requireAdmin` - Checks for ADMIN role
- **User lookup**: After token validation, fresh user data fetched from database (gets current preferences)

### Stash Integration

**Server-side**: Uses `stashapp-api` npm package with singleton pattern:
- `getStash()` returns single `StashApp` instance (initialized on startup)
- Validates `STASH_URL` and `STASH_API_KEY` environment variables
- All Stash queries use type-safe methods: `findScenes()`, `findPerformers()`, `configuration()`, etc.

**Caching strategy** ([server/services/StashCacheManager.ts](server/services/StashCacheManager.ts)):
- **On startup**: Fetches all scenes, performers, studios, tags, galleries, groups from Stash
- **Hourly refresh**: Background job refreshes entire cache every 60 minutes
- **Storage**: In-memory Maps for O(1) lookups by ID
- **Cache version**: Increments on each refresh for client invalidation
- **User filtering**: Optional filtered cache service applies per-user content restrictions

### Database Architecture

**Key models** ([server/prisma/schema.prisma](server/prisma/schema.prisma)):

- **User**: Credentials, preferences (quality, theme, preview quality), roles, filter presets
  - JSON fields: `carouselPreferences`, `navPreferences`, `filterPresets`, `defaultFilterPresets`
- **WatchHistory**: Per-user playback tracking (playCount, playDuration, resumeTime, oCount, detailed playHistory)
  - Composite unique: `@@unique([userId, sceneId])`
- **Playlist**: User playlists with shuffle/repeat modes
  - Has many `PlaylistItem` (sceneId + position)
- **Rating tables**: `SceneRating`, `PerformerRating`, `StudioRating`, `TagRating`, `GalleryRating`, `GroupRating`, `ImageRating`
  - Per-user ratings (0-100) and favorites
  - Composite unique: `@@unique([userId, entityId])`
- **UserPerformerStats**, **UserStudioStats**, **UserTagStats**: Pre-computed aggregates for recommendations (avoids expensive real-time calculations)
- **UserContentRestriction**: Per-user include/exclude filters (groups, tags, studios, galleries, etc.)
- **PathMapping**: Stash→Peek path translations (stashPath, peekPath pairs)
- **DataMigration**: Tracks which data migrations have run

**Normalization strategy**: User data in SQLite, Stash data in memory cache (server-wide)

### API Endpoint Structure

**Public** (no auth):
- `GET /api/health` - Server status
- `GET /api/version` - Version info
- `GET /api/proxy/stash` - Image/asset proxy (prevents API key exposure)
- `GET /api/setup/status` - Check if setup wizard needed

**Authentication**:
- `POST /api/auth/login` - Login, returns JWT in cookie
- `POST /api/auth/logout` - Clear session
- `GET /api/auth/check` - Verify auth and fetch user data

**Library** (authenticated):
- `/api/library/scenes` - Search/filter scenes (merges cache + user data)
- `/api/library/performers`, `/api/library/studios`, `/api/library/tags`, `/api/library/groups`, `/api/library/galleries`

**Streaming**:
- `GET /api/scene/:sceneId/stream` - Direct video file (no transcoding)
- `GET /api/scene/:sceneId/stream.m3u8?quality=480p` - HLS manifest (transcoded)

**User data**:
- `/api/user/*` - Preferences and stats
- `/api/watch-history/*` - Playback tracking
- `/api/ratings/*` - Per-user ratings
- `/api/playlist/*` - Playlist CRUD

**Admin**:
- `GET /api/stats` - Server statistics
- `POST /api/stats/refresh-cache` - Force Stash cache refresh

### Frontend Architecture

**Component hierarchy**:
- [App.jsx](client/src/App.jsx) → Route-based pages (lazy-loaded)
- `GlobalLayout` → Navigation, TopBar, PageLayout wrappers
- Pages compose UI components from `client/src/components/ui/`

**Context providers**:
- `AuthProvider` - User auth state and methods
- `ThemeProvider` - Global theme system
- `TVModeProvider` - UI mode (TV vs desktop)
- `ScenePlayerContext` - Current playing scene

**Custom hooks** ([client/src/hooks/](client/src/hooks/)):
- `useAuth()` - Access auth context
- `useWatchHistory()` - Playback tracking
- `useMediaKeys()`, `useKeyboardShortcuts()` - Keyboard navigation
- `useTVNavigation()`, `useSpatialNavigation()` - TV mode navigation

**Video player** ([client/src/components/video-player/](client/src/components/video-player/)):
- `VideoPlayer.jsx` - Main component
- `videoPlayerUtils.js` - Video.js configuration and quality selector setup
- `useVideoPlayer.js` - React hook for player lifecycle

### Configuration

**Required environment variables**:
- `STASH_URL` - GraphQL endpoint (e.g., `http://192.168.1.100:9999/graphql`)
- `STASH_API_KEY` - API key from Stash Settings → Security
- `DATABASE_URL` - SQLite path (default: `file:/app/data/peek-db.db`)
- `JWT_SECRET` - Secret for JWT signing (auto-generated if missing, but recommended to set manually)

**Optional environment variables**:
- `CONFIG_DIR` - Peek's config directory (default: `/app/data`)
- `STASH_INTERNAL_PATH` - Path Stash uses internally (default: `/data`, fallback only)
- `STASH_MEDIA_PATH` - Where Peek accesses Stash media (default: `/app/media`, fallback only)

**Path mappings**: Configured via Setup Wizard on first run, stored in database. Can be managed later via Settings → Path Mappings.

### Server Initialization Sequence

1. Load `.env` from project root (handles both dev and compiled scenarios)
2. Validate startup (STASH_URL and STASH_API_KEY present, else show setup wizard)
3. Initialize database (Prisma migrations, create default admin user if none exists)
4. Initialize PathMapper (load from database or migrate from env vars)
5. Setup Express app (routes, middleware, error handlers)
6. Initialize StashCacheManager (fetch all entities from Stash - this may take 30-60s)
7. Run pending data migrations (e.g., backfill stats for v1.4 → v1.5 upgrades)
8. Start listening on port 8000

**Important**: During cache initialization, `/api/health` returns 503 with `{"status": "initializing"}`. Client shows loading screen.

## Code Patterns and Conventions

### TypeScript Configuration

**Server** ([server/tsconfig.json](server/tsconfig.json)):
- Strict mode enabled
- Target: ES2020
- Module: ES2020 (native ES modules)
- Output: `dist/` directory

**Client** (React with Vite):
- React 19 with Babel React Compiler plugin
- Vite build config: [client/vite.config.js](client/vite.config.js)
  - Manual chunk splitting: `react-vendor`, `video-vendor`, `ui-vendor`
  - Terser minification with `drop_console: true` in production
  - Development proxy: `/api` → `http://peek-server:8000`

### Path Handling

**Internal paths use POSIX format** (`/` separators) for Docker/Linux compatibility:
- Convert Windows paths on input: `C:\Videos` → `/c/Videos` or direct mapping
- FFmpeg always uses POSIX paths

### Error Handling

- Controllers return structured JSON errors: `{ error: "message" }`
- Client API wrapper (`client/src/services/api.js`) handles auth failures and server errors
- Special 503 handling: Client detects server initialization and shows loading screen

### Data Flow Patterns

**Scene playback flow**:
1. Client requests `/api/library/scenes` with filters
2. Backend fetches from `stashCacheManager` (in-memory)
3. Merges user-specific data (watch history, ratings, restrictions from database)
4. Returns enriched scene list
5. Client plays via `/api/scene/:sceneId/stream.m3u8?quality=480p`
6. Backend creates/reuses transcoding session
7. FFmpeg streams continuously, generates segments
8. Video.js fetches segments via HLS

**User login flow**:
1. POST credentials to `/api/auth/login`
2. Backend validates, generates JWT (24h expiry)
3. Returns token in HTTP-only cookie
4. Client calls `/api/auth/check` to fetch user data
5. AuthContext populated with preferences
6. App renders authenticated UI

## Release Process

### Version Bumping

1. **Update version numbers** in both package.json files:
   ```bash
   # Manually edit client/package.json and server/package.json
   "version": "1.5.3"
   ```

2. **Commit version bump**:
   ```bash
   git add client/package.json server/package.json
   git commit -m "chore: bump version to 1.5.3"
   git push origin master
   ```

3. **Create and push Git tag**:
   ```bash
   git tag v1.5.3
   git push origin v1.5.3
   ```

4. **GitHub Actions automatically** (triggered by version tag):
   - Builds Docker image from `Dockerfile.production`
   - Tags as `:latest`, `:1.5.3`, and `:1.5`
   - Pushes to Docker Hub (`carrotwaxr/peek-stash-browser`)
   - Creates GitHub Release with auto-generated notes

5. **Users get notified**: Built-in update checker (Settings → Server Settings) shows "Update available" banner with link to GitHub release

**Version strategy**: Semantic versioning (major.minor.patch). package.json files are source of truth.

### Updating stashapp-api Dependency

**Important**: `stashapp-api` is a local package also authored/owned by the same developer. Local copy exists at `~/code/stashapp-api`.

**When you need NEW GraphQL fields/queries from Stash**:

1. **Go to stashapp-api project**:
   ```bash
   cd ~/code/stashapp-api
   ```

2. **Edit GraphQL operation files** in `src/operations/` (e.g., `findScenes.graphql`, `findPerformers.graphql`):
   ```graphql
   # Add new field to existing query
   query FindScenes($filter: FindFilterType, $scene_filter: SceneFilterType) {
     findScenes(filter: $filter, scene_filter: $scene_filter) {
       scenes {
         id
         title
         newField  # ← Add this
       }
     }
   }
   ```

3. **If new methods were added, export them from the SDK at index.ts**

4. **Regenerate types and build**:
   ```bash
   npm run codegen  # Regenerates TypeScript types from GraphQL operations
   npm run build    # Compiles TypeScript
   ```

5. **Commit ONLY source files** (`.graphql` files), NOT generated files:
   ```bash
   git add src/operations/findScenes.graphql
   git commit -m "feat: add newField to findScenes query"
   ```

6. **Publish to npm**:
   ```bash
   npm run publish:patch  # or :minor or :major depending on change
   # This automatically runs codegen + build via prepublishOnly hook
   ```

7. **Update peek-stash-browser dependency**:
   ```bash
   cd ~/code/peek-stash-browser/server
   npm install stashapp-api@<new-version>
   ```

8. **Update version reference** in this CLAUDE.md file (Project Overview section)

9. **Use the new field** in peek-stash-browser TypeScript code:
   ```typescript
   const stash = getStash();
   const scenes = await stash.findScenes({ ... });
   // scenes[0].newField is now available with full type safety
   ```

**Note**: The `stashapp-api` project has its own CLAUDE.md at `~/code/CLAUDE.md` with detailed workflow instructions.

## Key Files Reference

**Frontend**:
- [client/src/App.jsx](client/src/App.jsx) - Main app with routing
- [client/src/components/video-player/VideoPlayer.jsx](client/src/components/video-player/VideoPlayer.jsx) - Video player component
- [client/src/components/video-player/videoPlayerUtils.js](client/src/components/video-player/videoPlayerUtils.js) - Video.js setup and quality selector
- [client/src/services/api.js](client/src/services/api.js) - Base API client with error handling
- [client/src/contexts/AuthContext.jsx](client/src/contexts/AuthContext.jsx) - Authentication context

**Backend**:
- [server/index.ts](server/index.ts) - Server entry point (initialization sequence)
- [server/api.ts](server/api.ts) - Express app setup and routes
- [server/services/TranscodingManager.ts](server/services/TranscodingManager.ts) - Core transcoding logic (800+ lines)
- [server/services/StashCacheManager.ts](server/services/StashCacheManager.ts) - Stash data caching
- [server/controllers/video.ts](server/controllers/video.ts) - Video streaming endpoints
- [server/controllers/library.ts](server/controllers/library.ts) - Stash library proxy (scene search, etc.)
- [server/utils/pathMapping.ts](server/utils/pathMapping.ts) - Path translation utility
- [server/prisma/schema.prisma](server/prisma/schema.prisma) - Database schema

**Configuration**:
- [docker-compose.yml](docker-compose.yml) - Development environment
- [Dockerfile.production](Dockerfile.production) - Optimized production build (Node 22, multi-stage)
- [client/vite.config.js](client/vite.config.js) - Frontend build config (code splitting, terser)
- [server/tsconfig.json](server/tsconfig.json) - TypeScript config (strict mode, ES2020)

**Documentation**:
- [README.md](README.md) - User-facing documentation (installation, setup, updating)
- [REELS_IMPLEMENTATION.md](REELS_IMPLEMENTATION.md) - TikTok/Reels UI implementation plan (if exists)

## Common Development Tasks

### Adding a new API endpoint

1. Define route in `server/routes/` or `server/api.ts`
2. Create controller function in appropriate `server/controllers/` file
3. Add middleware as needed (`authenticateToken`, `requireAdmin`, etc.)
4. Update client API service in `client/src/services/` to call new endpoint
5. Test with manual API calls and integration testing

### Adding a new Prisma model

**CRITICAL: Follow this workflow exactly to avoid breaking user databases.**

1. **Edit schema**: Add/modify models in `server/prisma/schema.prisma`

2. **Create migration**: Run from `server/` directory:
   ```bash
   npx prisma migrate dev --name descriptive_name
   ```
   This creates a new folder in `prisma/migrations/` with the SQL.

3. **Verify migration SQL**: Check the generated `migration.sql` file looks correct

4. **Commit BOTH files**:
   ```bash
   git add prisma/schema.prisma prisma/migrations/YYYYMMDD_descriptive_name/
   git commit -m "feat: add NewModel to database schema"
   ```

5. **Test locally**: Restart Docker to verify migration applies correctly

6. **Production deployment**: The `docker/start.sh` script automatically runs `prisma migrate deploy` on container startup

**Common mistakes to avoid:**
- Never run `prisma db push` - it doesn't create migrations
- Never skip committing the migration folder
- Never manually edit migration SQL after it's been deployed
- Always test migrations against a copy of production data before releasing

### Updating Stash GraphQL queries (via stashapp-api)

**If query is already in stashapp-api**: Just update `stashapp-api` version in `server/package.json` and `npm install`.

**If you need a NEW query in stashapp-api**:
1. Go to `stashapp-api` project (sibling directory)
2. Edit `.graphql` files in `src/operations/`
3. Run `npm run codegen` to regenerate types
4. Run `npm run build`
5. Commit ONLY source files (`.graphql`), NOT generated files
6. Run `npm run publish:patch` (or `:minor` or `:major`)
7. Return to `peek-stash-browser/server` and `npm install stashapp-api@<new-version>`

### Adding a new React component

1. Create component file in `client/src/components/` (organized by feature)
2. Use Tailwind CSS for styling
3. Export from component file
4. Import and use in parent component
5. Follow existing patterns: functional components, hooks for state

### Debugging video playback issues

1. Check browser DevTools → Network tab for failed segment requests
2. Check server logs: `docker-compose logs -f peek-server`
3. Look for FFmpeg errors in TranscodingManager logs
4. Verify path mapping: `/api/library/scenes` should return valid `path` values
5. Test direct stream first: `/api/scene/:sceneId/stream` (no transcoding)
6. Check FFmpeg process list: `docker exec -it peek-stash-browser_peek-server_1 ps aux | grep ffmpeg`

### Working with the Setup Wizard

The setup wizard runs on first access if path mappings aren't configured:

1. **Auto-discovery**: Wizard queries Stash GraphQL for library paths
2. **User input**: User maps each Stash path to a Peek container path
3. **Database storage**: Mappings saved to `PathMapping` table
4. **Validation**: Wizard verifies paths are accessible before saving

To reset and re-run setup wizard: Delete all rows from `PathMapping` table and restart server.

## Testing Strategy

### Current Coverage

- **Unit tests**: Limited to filter configuration utils (`client/src/utils/__tests__/`)
- **Manual testing**: Primary testing method via browser and Docker

### Testing Checklist (for new features)

- [ ] Unit tests for utility functions and business logic
- [ ] Integration tests for API endpoints (planned)
- [ ] Manual testing in Docker environment (required)
- [ ] Test on multiple browsers (Chrome, Firefox, Safari)
- [ ] Test keyboard navigation and TV mode
- [ ] Test with different Stash configurations (single/multiple libraries)

### Running Manual Tests

1. Start Docker Compose: `docker-compose up -d`
2. Access at `http://localhost:6969`
3. Complete setup wizard (or use existing database)
4. Test feature thoroughly
5. Check browser console for errors
6. Check server logs: `docker-compose logs -f peek-server`
7. Verify no regressions in existing features

## Project Conventions

### Git Workflow

**Branch naming**:
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Critical production fixes
- `improvement/*` - General improvements

**Commit messages**: Conventional commits format
```
<type>: <subject>

<optional body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`

### Code Style

- **No emojis** in code or commit messages (unless user explicitly requests)
- **TypeScript strict mode**: No `any` types without justification
- **Comprehensive error handling**: Meaningful error messages, proper HTTP status codes
- **Self-documenting code**: Prefer clear naming over excessive comments
- **No console.log in production**: Use proper logging (Winston for server, planned for client)
- **Imports sorted**: Using `@trivago/prettier-plugin-sort-imports`

### Design Decisions

- **Quality selector over mode toggle**: Users select quality (Direct, 1080p, 720p, etc.) instead of "Direct vs Transcode" toggle
- **On-demand transcoding**: Don't pre-transcode; transcode based on user selection
- **Original file downloads**: Download features serve original files, not transcoded
- **Segment preservation**: Use `fs.renameSync()` (move) not `fs.copyFileSync()` (copy) for performance
- **Stash integration**: Consume existing Stash features (sprite sheets for thumbnails) rather than regenerating
- **Null returns vs throws**: Convenience methods return `null` if not found (e.g., `findPerformerById()`)

## Troubleshooting

### Common Issues

**Video won't play**:
- Check FFmpeg logs in server output
- Verify path mapping via `/api/library/scenes` response
- Check segment directory exists: `docker exec peek-server ls /app/data/hls-cache/`
- Test direct stream: `/api/scene/:sceneId/stream`

**Seeking broken**:
- Check TranscodingManager session state (logs show session restarts)
- Verify playlist URLs are correct in `.m3u8` file
- Check Video.js console errors

**Auth failures**:
- Verify `JWT_SECRET` is set (or auto-generated)
- Check database connection: `docker exec peek-server ls /app/data/`
- Clear browser cookies and retry login

**Build failures**:
- Check Node version (requires Node 18+)
- Verify all dependencies installed: `npm install`
- Clear `node_modules` and reinstall
- For Prisma errors: `npx prisma generate`

**Setup wizard loops**:
- Check path mappings exist: Query `PathMapping` table
- Verify paths are accessible from container
- Check server logs for path validation errors

### Docker Issues

**Container won't start**:
- Check logs: `docker-compose logs peek-server`
- Verify environment variables in `.env` file
- Check volume mounts are accessible
- Ensure ports 6969 and 8000 are not in use

**Hot reload not working**:
- Verify volume mounts in `docker-compose.yml`
- Check file permissions (especially on Windows/WSL)
- Use polling: Vite already configured with `usePolling: true`

**Media files not accessible**:
- Verify volume mounts: `docker-compose config` shows resolved paths
- Check file exists in container: `docker exec peek-server ls /app/media/`
- Review path mappings in database
- Test path translation with sample Stash path

## Resources

- **Stash API**: https://github.com/stashapp/stash/blob/develop/graphql/schema/schema.graphql
- **Video.js Docs**: https://docs.videojs.com/
- **HLS Specification**: https://datatracker.ietf.org/doc/html/rfc8216
- **FFmpeg HLS Format**: https://ffmpeg.org/ffmpeg-formats.html#hls-2
- **Prisma Docs**: https://www.prisma.io/docs/
- **React 19 Docs**: https://react.dev/
- **Project Documentation**: https://carrotwaxr.github.io/peek-stash-browser/
- **GitHub Repository**: https://github.com/carrotwaxr/peek-stash-browser

## Notes for AI Assistant

When working on this codebase:

1. **Don't edit master**: Ensure code changes are done on new branches, not `master`, except for versioning and tagging before pushing a release
2. **Ask questions**: If requirements are unclear, ask user before implementing
3. **Update docs**: Keep documentation (README.md and /docs/) in sync with code changes
4. **Concise communication**: User prefers direct, technical responses
5. **Path handling**: Remember POSIX format for all internal paths
6. **Watch cache**: Changes to Stash queries may require cache invalidation/refresh
7. **Version sync**: Keep client and server package.json versions in sync
8. **Database changes - CRITICAL**:
   - ALWAYS use `npx prisma migrate dev --name <name>` to create migrations
   - NEVER use `prisma db push` - it doesn't create migration files and can cause data loss
   - ALWAYS commit both `schema.prisma` AND the migration folder
   - The baseline migration `0_baseline` represents the v2.0.0 schema - never modify it
   - Future schema changes MUST have their own migration files
