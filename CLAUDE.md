# Peek Stash Browser

Web application for browsing and streaming Stash media with multi-instance support, playlists, ratings, and multi-user access control.

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 3, Video.js 7
- **Backend**: Node.js/Express 5, TypeScript (strict), Prisma 6, SQLite
- **Video**: Proxies Stash's native HLS streams with playlist URL rewriting
- **Deployment**: Docker (dev: docker-compose, prod: single container + Nginx)
- **Stash API**: Internal `StashClient` using `graphql-request` + GraphQL codegen SDK

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

Docker is required for the full dev environment. Direct Node.js (`npm run dev`) works for quick validation but isn't fully functional.

## Architecture

### Multi-Instance Support

Peek connects to **multiple Stash servers** simultaneously. This is a core architectural pattern:

- `StashInstance` model stores server configs (URL, API key, priority)
- `UserStashInstance` controls which instances each user sees
- `StashInstanceManager` service manages connections and credentials
- All cached entity tables use **composite keys**: `@@id([id, stashInstanceId])`
- Query builders, stats, and user data functions all require `instanceId` awareness

### Video Streaming (server/controllers/video.ts)

Peek does **not** transcode video itself. It proxies Stash's native streaming:

- Rewrites HLS playlist URLs to route through Peek's proxy (`/api/proxy/stash`)
- Strips Stash API keys from segment URLs for security
- Supports per-instance stream routing via `instanceId` parameter
- Connection pooling and concurrency limiting via `server/controllers/proxy.ts`

### Stash Integration

- `StashClient` (`server/graphql/StashClient.ts`): Internal GraphQL client using generated SDK
- `StashSyncService`: Syncs entity data from Stash instances into local SQLite cache
- `StashEntityService`: Cached entity lookups and relationships
- `StashInstanceManager`: Multi-instance connection lifecycle
- GraphQL codegen config: `server/codegen.yml` generates `server/graphql/generated/graphql.ts`
- All Stash image/stream URLs proxied via `/api/proxy/stash` to hide API keys

### Authentication

- JWT in HTTP-only cookies (24h expiry, auto-refresh)
- Supports reverse proxy auth via `PROXY_AUTH_HEADER`
- Roles: ADMIN, USER
- Middleware: `authenticate`, `requireAdmin`, `requireCacheReady` (in `server/middleware/auth.ts`)

### Key Services (server/services/)

| Service | Purpose |
|---------|---------|
| `StashInstanceManager` | Multi-instance connection management |
| `StashSyncService` | Entity sync from Stash to local cache |
| `StashEntityService` | Cached entity lookups and relations |
| `SceneQueryBuilder` | Scene filtering with complex joins |
| `PerformerQueryBuilder`, `GalleryQueryBuilder`, etc. | Per-entity query builders |
| `UserStatsService` | User engagement tracking (play counts, O counter) |
| `RankingComputeService` | Engagement scoring and percentile ranking |
| `ExclusionComputationService` | Pre-computed content restriction caching |
| `MergeReconciliationService` | Scene merge/duplicate handling |
| `DataMigrationService` | Schema data migrations |

### Controllers (server/controllers/)

Video, proxy, setup, user, playlist, stats, userStats, ratings, watchHistory, download, clips, carousel, customTheme, groups, imageViewHistory, timelineController, plus `library/` subdirectory with per-entity files (scenes, performers, studios, tags, groups, galleries, images).

## Database

**Always use migrations, never `prisma db push`.**

### Key Model Groups

- **Users**: User, UserGroup, UserGroupMembership
- **Stash Cache**: StashScene, StashPerformer, StashStudio, StashTag, StashGroup, StashGallery, StashImage, StashClip (all with composite keys `[id, stashInstanceId]`)
- **Multi-Instance**: StashInstance, UserStashInstance, UserCarousel
- **User Activity**: WatchHistory, ImageViewHistory, Playlist, PlaylistItem, PlaylistShare, Download
- **Ratings**: SceneRating, PerformerRating, StudioRating, TagRating, GalleryRating, GroupRating, ImageRating
- **Stats**: UserPerformerStats, UserStudioStats, UserTagStats, UserEntityRanking, UserEntityStats
- **Permissions**: UserContentRestriction, UserHiddenEntity, UserExcludedEntity
- **Sync**: SyncState, SyncSettings, DataMigration, MergeRecord
- **Other**: CustomTheme
- **Junction Tables**: ScenePerformer, SceneTag, SceneGroup, SceneGallery, ImagePerformer, ImageTag, ImageGallery, GalleryPerformer, PerformerTag, StudioTag, GalleryTag, GroupTag, ClipTag

### Creating Migrations

**Important:** Due to FTS (Full-Text Search) virtual tables in the schema, `prisma migrate dev` often fails with schema drift errors. Use this manual process instead:

```bash
cd server

# 1. Create migration directory with timestamp
mkdir -p prisma/migrations/YYYYMMDD000000_descriptive_name

# 2. Write the migration SQL manually
cat > prisma/migrations/YYYYMMDD000000_descriptive_name/migration.sql << 'EOF'
-- Description of what this migration does
ALTER TABLE "TableName" ADD COLUMN "columnName" TEXT;
EOF

# 3. Update schema.prisma to match the migration

# 4. Regenerate Prisma client
npx prisma generate

# 5. Apply migration to dev database
npx prisma migrate deploy

# 6. Run tests to verify
npm test
```

**Why manual migrations?** Prisma's introspection doesn't handle SQLite FTS virtual tables well, causing `prisma migrate dev` to detect false schema drift and request a database reset. The FTS tables are created via raw SQL in migrations and work correctly at runtime.

### Applying Migrations

```bash
npx prisma migrate deploy  # Apply pending migrations (dev and production)
```

In Docker, migrations are applied automatically on container startup.

## Release Process

Use `/release-workflow` for the full process overview. Quick reference:
1. Run `/pre-release` to validate (tests, lint, build, Docker build)
2. Run `/release-alpha` (stable) or `/release-beta` (beta) to bump versions, commit, tag, and push
3. GitHub Actions (`.github/workflows/docker-build.yml`) builds Docker image and creates release

## Key Files

**Frontend**: `client/src/components/video-player/VideoPlayer.jsx`, `client/src/services/api.js`
**Backend**: `server/controllers/video.ts`, `server/controllers/proxy.ts`, `server/controllers/library/scenes.ts`
**Services**: `server/services/StashInstanceManager.ts`, `server/services/StashSyncService.ts`, `server/services/StashEntityService.ts`
**GraphQL**: `server/graphql/StashClient.ts`, `server/graphql/generated/graphql.ts`, `server/codegen.yml`
**Config**: `docker-compose.yml`, `Dockerfile.production`, `server/prisma/schema.prisma`

## Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`
Instance config: `STASH_URL` and `STASH_API_KEY` (legacy env-based setup, now configurable via Setup Wizard UI with multi-instance support)
Optional: `PROXY_AUTH_HEADER`, `SECURE_COOKIES`, `CONFIG_DIR`, `PEEK_DATA_DIR`, `PEEK_FRONTEND_PORT`, `PEEK_BACKEND_PORT`

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

### Test Stash Instance

A dedicated test Stash instance (`stash-test` on unraid) is available for integration testing:
- **URL**: `http://10.0.0.4:6971/graphql` (credentials in `.env` as `STASH_TEST_*`)
- **Container**: `stash-test` on unraid
- **Volumes**: `/data` (videos), `/images` (images)

**Setting up test entities:**
Test entities can be created/modified via Stash GraphQL API. Use curl with the API key:
```bash
curl -s 'http://10.0.0.4:6971/graphql' \
  -H 'ApiKey: $STASH_TEST_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query": "mutation { ... }"}'
```

Common operations:
- **Create group**: `groupCreate(input: { name: "..." })`
- **Add scenes to group**: `sceneUpdate(input: { id: "X", groups: [{ group_id: "Y" }] })`
- **Create gallery**: `galleryCreate(input: { title: "...", tag_ids: [...] })`
- **Add images to gallery**: `imageUpdate(input: { id: "X", gallery_ids: ["Y"] })`
- **Add tags to performer**: `performerUpdate(input: { id: "X", tag_ids: [...] })`
- **Trigger scan**: `metadataScan(input: { paths: ["/images"] })`

**Adding test media via SSH:**
```bash
ssh root@10.0.0.4
# Images go to: /mnt/user/syslib/bunh/stash-test/img/
# Videos go to: /mnt/user/syslib/bunh/stash-test/vid/
```

After adding files, trigger a scan in Stash to pick them up.

## Issue Tracking

- GitHub: https://github.com/carrotwaxr/peek-stash-browser/issues
- Discourse: https://discourse.stashapp.cc/t/peek-stash-browser/4018
