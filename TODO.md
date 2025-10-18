# Upcoming Features, Improvements, and Fixes

This document tracks pending work items for peek-stash-browser. Items are organized by priority based on value vs. effort ratio.

---

## Status Definitions

- **Pending**: Ready to be worked on, well-defined
- **Blocked**: Waiting for information/decisions before work can begin
- **Idea**: Needs more planning/discussion before implementation
- **Partial**: Some work done, more needed
- **In Progress**: Currently being worked on
- **Fixed**: Completed in current or upcoming release

---

## Priority System

- **Critical**: Blocking issues, major bugs, or essential features
- **High**: High value, reasonable effort - should be done soon
- **Medium**: Good value, may require more effort
- **Low**: Nice to have, lower priority

---

# CRITICAL PRIORITY

_No items currently at critical priority._

---

# HIGH PRIORITY

_No items currently at high priority._

---

# MEDIUM PRIORITY

## Scene Preview/Thumbnails (Seek Hover)

- **Status**: Pending
- **Priority**: Medium
- **Description**: Display thumbnails on seek bar hover using Stash's existing sprite sheets
- **Current State**: Stash generates sprite sheets but Peek doesn't use them
- **Needed Work**:
  - Query Stash GraphQL API for sprite sheet data (URL, dimensions, grid layout)
  - Implement seek bar hover handler
  - Calculate which sprite to show based on hover position
  - Display sprite in tooltip above seek bar
  - Handle cases where sprite sheets don't exist
  - Test with various video lengths and sprite sheet configurations
- **Technical Notes**:
  - Stash sprite sheet data available in Scene query
  - Video.js may have plugins for this functionality
  - Files: `client/src/components/video-player/VideoPlayer.jsx`, `videoPlayerUtils.js`
  - CSS for tooltip positioning and sprite clipping
- **Benefit**: Easier navigation, visual feedback when seeking (standard video player feature)

## Error Recovery for Transcoding

- **Status**: Pending
- **Priority**: Medium
- **Description**: Better handling of transcoding failures
- **Current State**: Transcoding errors may cause playback to fail without recovery
- **Needed Work**:
  - Detect transient FFmpeg failures (network, temporary file locks)
  - Implement automatic retry with exponential backoff
  - Fallback to direct play if transcoding consistently fails
  - Show user notification for persistent failures
  - Add detailed error logging for debugging
  - Track error patterns for monitoring
- **Technical Notes**:
  - File: `server/services/TranscodingManager.ts`
  - Distinguish between permanent errors (codec issues) and transient errors
  - Retry limit: 3 attempts with backoff
  - Log full error context for analysis
- **Benefit**: More robust playback, fewer user-facing errors, better user experience

---

# LOW PRIORITY

## Scene Browsing: Sort and Filter Enhancements

- **Status**: Blocked
- **Priority**: Low
- **Description**: Improve sort and filter options on scene browsing pages
- **Current State**: ⚠️ **BLOCKED - Needs manual inspection to document current state**
- **Needed Work**:
  - ⚠️ **TODO**: Document existing sort options
  - ⚠️ **TODO**: Document existing filter options and their current state
  - Fix any broken sort options
  - Add missing sort options (date added, rating, duration, etc.)
  - Complete filter implementation
  - Add more filter types (performer, studio, tags, date range)
  - Persist sort/filter preferences per user in database
- **Technical Notes**:
  - Files: `client/src/components/pages/Scenes.jsx`, `SceneSearch` component
  - Filter state management needs review
  - Consider using URL query params for shareable filtered views
- **Benefit**: Better content discovery, easier navigation

## Homepage Carousel Customization

- **Status**: Blocked
- **Priority**: Low
- **Description**: Add more carousel types and allow user customization
- **Current State**: ⚠️ **BLOCKED - Needs manual inspection to document existing carousels**
- **Needed Work**:
  - ⚠️ **TODO**: Document currently implemented carousel types
  - Add additional carousel types (Recently Added, Trending, By Studio, By Performer, Random, etc.)
  - Create user settings page for carousel preferences
  - Toggle to enable/disable specific carousels
  - Drag-and-drop to reorder carousels
  - Store carousel preferences per user in database
  - Add API endpoints for saving/loading carousel preferences
- **Technical Notes**:
  - Files: `client/src/components/pages/Home.jsx`
  - Database: Add `user_preferences` table or JSON field in User model
  - Consider carousel templates vs. dynamic configuration
- **Benefit**: Personalized homepage, better content discovery

## Loading State Improvements

- **Status**: Idea
- **Priority**: Low
- **Description**: Better visual feedback during transcoding and buffering
- **Current State**: Basic loading spinners, no detailed feedback
- **Needed Work**:
  - Show estimated time until playback ready (based on transcode speed)
  - Display current buffer status (seconds buffered)
  - Show transcode progress (percentage, segments completed)
  - Visual indicators for different states (transcoding vs network vs buffering)
  - Progress bars and status text
  - Differentiate between "transcoding starting" and "waiting for buffer"
- **Technical Notes**:
  - Files: `client/src/components/video-player/VideoPlayer.jsx`
  - May need to poll API for transcode progress
  - Use Video.js buffer events for buffer status
- **Benefit**: Less user confusion during waits, better perceived performance

## Keyboard Shortcuts

- **Status**: Idea
- **Priority**: Low
- **Description**: Add comprehensive keyboard shortcuts for video player
- **Current State**: Basic Video.js shortcuts work (space, arrows)
- **Needed Work**:
  - Previous/Next video in playlist (Shift+N, Shift+P)
  - Quality selection menu (Q key)
  - Speed controls (< and > or [ and ])
  - Jump to percentage (0-9 keys for 0%-90%)
  - Create keyboard shortcut handler component
  - Show keyboard shortcut help overlay (? key)
- **Technical Notes**:
  - Files: `client/src/components/video-player/VideoPlayer.jsx`
  - Use `useEffect` with keyboard event listeners
  - Prevent conflicts with Video.js default shortcuts
  - Only active when video player is focused/visible
- **Benefit**: Power users can navigate more efficiently

## Download Content for Offline Viewing

- **Status**: Idea
- **Priority**: Low
- **Description**: Allow users to download original videos and playlists
- **Current State**: No download functionality
- **Needed Work**:
  - **Single Video Download**: Add download button to scene page
    - Stream original file from Stash through Peek backend
    - Set proper Content-Disposition headers for browser download
    - Show download progress
  - **Playlist Download**: Add playlist download option
    - Create temporary directory with all playlist videos
    - Generate M3U/M3U8 playlist file with relative paths
    - Create ZIP archive of folder
    - Stream ZIP to user
    - Clean up temporary files after download
  - Progress indicator for downloads
  - Background download queue (optional)
- **Technical Notes**:
  - Backend route: `/api/video/download/:id`
  - Playlist route: `/api/playlist/download/:id`
  - Use streaming for large files to avoid memory issues
  - May need to use archiver library (like `archiver` npm package) for ZIP creation
  - Consider disk space implications for large playlists
- **Benefit**: True offline capability without requiring transcoding, useful for travel

## Database Migrations System

- **Status**: Pending
- **Priority**: Low
- **Description**: Implement proper database migration system
- **Current State**: Schema changes require manual database updates
- **Needed Work**:
  - Use Prisma migrations properly (`prisma migrate dev`, `prisma migrate deploy`)
  - Version tracking for migrations
  - Rollback capability for failed migrations
  - Migration testing in CI/CD pipeline
  - Document migration workflow for developers
  - Add migration scripts to package.json
- **Technical Notes**:
  - Prisma already supports migrations, need to adopt workflow
  - Files: `server/prisma/schema.prisma`, `server/prisma/migrations/`
  - Add migration commands to deployment documentation
- **Benefit**: Easier upgrades, less risk of data loss, safer schema changes

## Docker Image Optimization

- **Status**: Idea
- **Priority**: Low
- **Description**: Reduce Docker image size and build time
- **Current State**: Current image size not optimized
- **Needed Work**:
  - Optimize multi-stage build process
  - Remove unnecessary dependencies from final image
  - Use `.dockerignore` to exclude dev files
  - Improve layer caching (order of operations in Dockerfile)
  - Consider Alpine base image (if compatible with dependencies)
  - Run security scan on final image
  - Document image size before/after
- **Technical Notes**:
  - Files: `Dockerfile.production`, `.dockerignore`
  - Be careful with Alpine - some npm packages need glibc
  - Test thoroughly after changes
- **Benefit**: Faster deployments, less disk usage, faster pulls

## Testing Infrastructure

- **Status**: Pending
- **Priority**: Low
- **Description**: Add automated testing
- **Current State**: No automated tests
- **Needed Work**:
  - Choose testing frameworks (Jest, Vitest, Playwright)
  - Unit tests for critical functions:
    - TranscodingManager methods
    - Path mapping utilities
    - API utilities
  - Integration tests for API endpoints:
    - Authentication flows
    - Video streaming
    - Playlist operations
  - E2E tests for video playback flows:
    - Direct play
    - Transcoded playback
    - Seeking
    - Quality switching
  - Set up CI/CD pipeline with test runs (GitHub Actions)
  - Code coverage reporting
- **Technical Notes**:
  - Frontend: Vitest + React Testing Library
  - Backend: Jest or Vitest
  - E2E: Playwright
  - Files: `*.test.ts`, `.github/workflows/test.yml`
- **Benefit**: Catch regressions, safer refactoring, more confidence in changes

## API Documentation

- **Status**: Pending
- **Priority**: Low
- **Description**: Document all API endpoints
- **Current State**: No API documentation
- **Needed Work**:
  - Document all endpoints with request/response schemas
  - Authentication requirements for each endpoint
  - Error codes and meanings
  - Example requests/responses
  - Generate OpenAPI/Swagger specification
  - Set up Swagger UI for interactive docs
  - Keep documentation up to date with code
- **Technical Notes**:
  - Use JSDoc comments or TypeScript for inline documentation
  - Consider `swagger-jsdoc` or `tsoa` for auto-generation
  - Host Swagger UI at `/api-docs` endpoint
- **Benefit**: Easier integration, clearer API contract, better developer experience

## Deployment Guides

- **Status**: Partial
- **Priority**: Low
- **Description**: Comprehensive deployment documentation
- **Current State**: unRAID deployment documented in `UNRAID-DEPLOYMENT.md`
- **Needed Work**:
  - Docker Compose standalone deployment guide
  - Kubernetes deployment guide (Helm chart?)
  - Reverse proxy configuration guides:
    - Nginx
    - Traefik
    - Caddy
  - SSL/TLS setup guides
  - Troubleshooting common issues section
  - Environment variable reference
  - Performance tuning guide
- **Technical Notes**:
  - Files: Create `docs/` directory with separate guides
  - Include example configuration files
  - Test instructions on fresh systems
- **Benefit**: Easier adoption, fewer support requests, broader user base

---

# IDEAS FOR FUTURE CONSIDERATION

These items need more planning/discussion before moving to actionable status.

## Multi-User Features

- Separate watch history per user
- User preferences (default quality, autoplay settings)
- Viewing statistics and recommendations
- Watch party / shared viewing sessions

## Advanced Search

- Full-text search across scene metadata
- Advanced filter combinations (performer AND studio AND tag)
- Date range filters
- Duration range filters
- Rating filters
- Saved searches per user

## Mobile App

- Native iOS/Android apps
- Better touch controls optimized for mobile
- Offline downloads for mobile
- Background playback (audio continues when app backgrounded)
- Picture-in-picture mode

## Stats Dashboard

- Server resource usage (CPU, RAM, disk)
- Transcoding queue status and history
- Popular content analytics
- User activity metrics
- Bandwidth usage tracking

## Integration Improvements

- Deeper Stash integration (markers, scene editing, tagging)
- Support for other media servers (Jellyfin, Plex, Emby)
- Webhook notifications for transcoding completion
- Plugin system for extensibility

## Completed Work

### Quality Selector Implementation

- **Priority**: High
- **Description**: Replace "Playback Mode" selector with quality-based selection
- **Completed Work**:
  - Added 1080p preset to `QUALITY_PRESETS` in `server/services/TranscodingManager.ts`
  - Replaced PlaybackControls mode selector with quality dropdown
  - Implemented quality options: `Direct`, `1080p`, `720p`, `480p`, `360p`
  - Updated VideoPlayer logic to handle quality parameter
  - Quality passed to TranscodingManager for on-demand transcoding
  - UI shows current selected quality during playback
  - All quality levels tested and working
- **Technical Implementation**:
  - Component: `client/src/components/video-player/PlaybackControls.jsx`
  - Backend: `server/services/TranscodingManager.ts` (QUALITY_PRESETS)
  - `Direct` = native playback (no transcoding)
  - Other qualities trigger on-demand transcoding
  - No pre-transcoding or automatic quality switching
  - Quality parameter flows: UI → VideoPlayer → /api/video/play → TranscodingManager
- **Benefit**: Intuitive UX matching YouTube/Netflix, users can choose quality based on bandwidth/device

### Page/Tab Titles

- **Priority**: High
- **Description**: Add descriptive `document.title` to each page for better tab identification
- **Completed Work**:
  - Created `usePageTitle()` custom hook for consistent title management
  - Added page titles to all pages following pattern: "Page Name - Peek"
  - Homepage displays "Peek" only
  - List pages show "Scenes - Peek", "Performers - Peek", etc.
  - Detail pages show entity names: "Scene Name - Peek", "Performer Name - Peek", etc.
  - Settings pages show descriptive titles: "My Settings - Peek", "Server Settings - Peek"
- **Technical Implementation**:
  - New hook: `client/src/hooks/usePageTitle.js`
  - Hook automatically sets and cleans up document title on mount/unmount
  - Supports dynamic titles that update when entity data loads
  - All page components updated to use the hook
- **Benefit**: Users can now easily identify tabs at a glance when working with multiple browser tabs

### Direct/Bookmark Link Capabilities

- **Priority**: High
- **Description**: Ensure any frontend route can be loaded independently without navigation context
- **Completed Work**:
  - Audited all detail page routes (Scene, Performer, Studio, Tag)
  - Found PerformerDetail, StudioDetail, and TagDetail already supported direct access
  - Added fallback data fetching to Scene.jsx for direct URL access
  - Verified all `find` API routes support `ids` filter for single-entity fetching
  - Implemented loading and error states for Scene.jsx
  - Preserved navigation state optimization for performance
- **Technical Implementation**:
  - Scene.jsx now checks for navigation state first (performance)
  - Falls back to API fetch using `libraryApi.findScenes({ ids: [sceneId] })` if no state
  - Shows loading spinner while fetching
  - Shows error message with "Browse Scenes" button if fetch fails
  - Pattern: `useEffect(() => { if (!sceneFromState) fetchScene() }, [sceneId, sceneFromState])`
  - Files modified: `client/src/components/pages/Scene.jsx`
- **Benefit**: Users can now bookmark, open links in new tabs, or share direct links to any page

### Success/Error/Warning/Info Components

- **Priority**: High
- **Description**: Create reusable feedback components for consistent user messaging
- **Completed Work**:
  - Created `SuccessMessage` component (green, check icon)
  - Created `ErrorMessage` component (red, X icon)
  - Created `WarningMessage` component (yellow, warning icon)
  - Created `InfoMessage` component (blue, info icon)
  - Integrated react-hot-toast library for toast notifications
  - Created custom toast components that match app theme
  - All components support auto-dismiss with configurable timeout
  - Components placed in `client/src/components/ui/`
- **Technical Implementation**:
  - Library: react-hot-toast v2.6.0
  - Components: SuccessMessage.jsx, ErrorMessage.jsx, WarningMessage.jsx, InfoMessage.jsx
  - Tailwind styling matches app theme (dark mode support)
  - Auto-dismiss after 3-5 seconds (configurable)
  - Support for both inline and toast display modes
- **Benefit**: Professional toast notifications, visual consistency, better UX

### Logging System Implementation

- **Priority**: High
- **Description**: Implement proper logging levels and reduce log spam
- **Completed Work**:
  - Created backend logger utility with levels: `error`, `warn`, `info`, `http`, `verbose`, `debug`
  - Implemented structured logging with Winston including timestamps and context
  - Created FFmpeg-specific logging utilities for cleaner transcoding output
  - Replaced all `console.log` calls with appropriate logger methods across backend
  - Removed all verbose console.log statements from frontend components (24 files)
  - Set Video.js log level to `warn` to reduce video player console spam
  - Removed debugging logging modules (videoPlayerLogging.js functions disabled)
  - Backend logs now include structured context (sessionId, sceneId, quality, etc.)
- **Technical Implementation**:
  - Backend: `server/utils/logger.ts` - Winston-based structured logger
  - Backend: `server/utils/ffmpegLogger.ts` - FFmpeg output parsing utilities
  - Frontend: Video.js log level set in `videoPlayerUtils.js` (`videojs.log.level("warn")`)
  - Frontend: Removed 19 console.log statements from VideoPlayer.jsx
  - Frontend: Removed 20+ console.log statements from videoPlayerUtils.js
  - Frontend: Disabled verbose logging setup (setupVideoJsLogging, setupNetworkLogging)
  - Backend files migrated: api.ts, controllers/video.ts, index.ts, TranscodingManager.ts, pathMapping.ts
  - Frontend files cleaned: All page components, UI components, contexts, hooks, and services
- **Benefit**: Much cleaner console output, easier debugging, production-ready logging, better development experience

### Segment State Tracking Enhancement

- **Priority**: Medium
- **Description**: Implement granular segment state tracking with status enum
- **Completed Work**:
  - Defined `SegmentState` enum with values: `waiting`, `transcoding`, `completed`, `failed`
  - Changed `completedSegments` from `Set<number>` to `segmentStates: Map<number, SegmentMetadata>`
  - Implemented state transition tracking in playlist monitor
  - Added automatic retry logic with max 3 attempts for failed segments
  - Added timeout detection (60s per segment) with retry
  - Exposed segment state via new API endpoint `/api/video/session/:sessionId/segments`
  - Updated session status endpoint to include progress summary (completed/transcoding/failed counts)
  - Track segment timestamps (startTime, completedTime)
  - Track retry count and last error message for failed segments
- **Technical Implementation**:
  - Files: `server/services/TranscodingManager.ts`, `server/controllers/video.ts`, `server/api.ts`
  - New interface: `SegmentMetadata` with fields: state, startTime, completedTime, lastError, retryCount
  - Helper methods: `getCompletedSegmentCount()`, `getSegmentStates()`
  - API endpoint returns detailed segment information with summary stats
  - Session status now includes progress object with percentages
  - Retry logic checks elapsed time and retry count before marking as failed
  - Max retries constant: `MAX_SEGMENT_RETRIES = 3`
- **Benefit**: Much better debugging, real-time progress tracking, automatic recovery from transient failures, detailed monitoring via API

### Playlist Status Card on Scene Page

- **Priority**: Medium
- **Description**: Show playlist context when viewing a scene that's part of a playlist
- **Completed Work**:
  - Created `PlaylistStatusCard` component with full playlist context
  - Shows playlist name and current position ("3 of 12")
  - Previous/Next navigation buttons with disabled states
  - Thumbnail strip showing nearby scenes (2 before/after, plus first/last)
  - Visual indicators for current scene (larger thumbnail, accent border)
  - Click any thumbnail to jump to that scene
  - "View Full Playlist" button
  - Ellipsis indicators for gaps in thumbnail strip
  - Integrated on Scene page when playlist context is available
- **Technical Implementation**:
  - Component: `client/src/components/playlist/PlaylistStatusCard.jsx`
  - Updated: `client/src/components/pages/Scene.jsx` - integrated status card
  - Uses lucide-react icons (ChevronLeft, ChevronRight, List)
  - Playlist context passed via React Router navigation state
  - Shows up to 7 thumbnails with smart selection (nearby + endpoints)
  - Navigation preserves playlist context across scenes
- **Benefit**: Excellent binge-watching UX, clear playlist context, easy navigation within playlist

### Convenience API Methods

- **Priority**: Medium
- **Description**: Add convenience methods for fetching single entities by ID
- **Completed Work**:
  - Added `findPerformerById(id)` method to `libraryApi`
  - Added `findSceneById(id)` method to `libraryApi`
  - Added `findStudioById(id)` method to `libraryApi`
  - Added `findTagById(id)` method to `libraryApi`
  - Each method returns single entity or `null` if not found
  - All methods use existing `find*` methods with `ids: [id]` parameter
  - Build and lint pass with no errors
- **Technical Implementation**:
  - File: `client/src/services/api.js`
  - Pattern: `async findPerformerById(id) { const result = await apiPost("/library/performers", { ids: [id] }); return result?.performers?.[0] || null; }`
  - Same pattern for scenes, studios, and tags
  - Uses optional chaining and nullish coalescing for clean null handling
  - Full JSDoc comments for each method
- **Benefit**: Cleaner code, less boilerplate for single-entity fetching, more intuitive API

### Playlist Management Enhancements

- **Priority**: Medium
- **Description**: Enhanced playlist features beyond basic playback
- **Completed Work**:
  - Database schema already existed (Playlist and PlaylistItem tables)
  - Custom playlist CRUD operations already working
  - Added shuffle mode toggle (persists to database)
  - Added repeat modes (None, Repeat All, Repeat One) with cycle button
  - Drag-and-drop reordering with HTML5 native DnD
  - Visual drag handles with position numbers
  - Real-time reorder preview with Save/Cancel confirmation
  - Add/remove scenes from playlist (already working)
  - Shuffle/repeat preferences persist per playlist
  - Playlist navigation respects shuffle and repeat modes
- **Technical Implementation**:
  - Updated: `client/src/components/pages/PlaylistDetail.jsx` - shuffle/repeat/reorder UI
  - Updated: `client/src/components/video-player/usePlaylistNavigation.js` - shuffle/repeat logic
  - Updated: `server/prisma/schema.prisma` - added shuffle/repeat fields
  - Migration: `server/prisma/migrations/20250117_add_playlist_shuffle_repeat/migration.sql`
  - Updated: `server/controllers/playlist.ts` - support shuffle/repeat in update endpoint
  - Uses Fisher-Yates shuffle algorithm for unbiased randomization
  - HTML5 drag events (no external library needed)
  - Shuffle mode uses useMemo for stable shuffle order
  - Repeat One replays same scene, Repeat All loops playlist
  - Reorder uses Prisma transaction for atomic updates
  - UI icons from lucide-react (Shuffle, Repeat, Repeat1)
- **Benefit**: Complete playlist experience matching YouTube/Netflix/Spotify - shuffle, repeat, reordering, and status card

### Build and Performance Optimizations

- **Priority**: Medium
- **Description**: Optimize build process and runtime performance
- **Completed Work**:
  - Enabled terser minification with console.log removal in production
  - Implemented code splitting for all 13 page components with React.lazy()
  - Configured manual vendor chunks (react, video.js, ui libraries)
  - Added rollup-plugin-visualizer for bundle analysis
  - Tree shaking already enabled by Vite (ESM)
  - Console.logs and debugger statements removed in production
  - All routes wrapped in Suspense with loading fallback
- **Technical Implementation**:
  - Files: `client/vite.config.js` (build config), `client/src/App.jsx` (lazy loading)
  - Build Results:
    - Before: Single bundle 2,013 kB (505 kB gzipped)
    - After: Core bundle 205 kB (64 kB gzipped) - 90% reduction
    - React vendor: 43 kB (15 kB gzipped)
    - Video.js vendor: 688 kB (200 kB gzipped) - loads only when needed
    - UI vendor: 563 kB (145 kB gzipped)
    - Page chunks: 3-26 kB each (lazy loaded on demand)
  - New scripts: `npm run build:analyze` - opens bundle visualization
  - Documentation: Added comprehensive build optimization section to DEVELOPERS.md
- **Benefit**: 90% smaller initial bundle, faster time-to-interactive, better browser caching, pages load on-demand

---

## How to Use This Document

**For Developers**:

- Pick items from top of priority list
- Update status as work progresses
- Add new items as discovered
- Fill in details for `Blocked` items after inspection

**For Users**:

- This shows what's coming
- Vote on priorities via GitHub issues
- Suggest new features

---

**Last Updated**: 2025-10-17
