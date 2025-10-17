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

## Quality Selector Implementation

- **Status**: Pending
- **Priority**: High
- **Description**: Replace "Playback Mode" selector with quality-based selection
- **Current State**: Users select between "Direct Play" and "Transcode" (480p default)
- **Needed Work**:
  - Add 1080p preset to `QUALITY_PRESETS` in `server/services/TranscodingManager.ts`
  - Replace PlaybackControls component's mode selector with quality dropdown
  - Add quality options: `Direct`, `1080p`, `720p`, `480p`, `360p`
  - Update video player logic to map quality selection to transcode parameters
  - Pass selected quality to TranscodingManager session creation
  - Update UI to show current quality during playback
  - Test all quality levels for proper transcoding
- **Technical Notes**:
  - `Direct` = native playback (no transcoding, current "Direct Play" mode)
  - All quality options implicitly force transcoding
  - Transcode on-demand based on user selection (not pre-emptive)
  - No automatic quality switching needed initially
  - Infrastructure already exists in QUALITY_PRESETS (360p, 480p, 720p)
- **Benefit**: Simpler UX, matches standard video player behavior (YouTube, Netflix, etc.)

## Page/Tab Titles

- **Status**: Fixed
- **Priority**: High
- **Description**: Add descriptive `document.title` to each page for better tab identification
- **Current State**: All pages now have descriptive titles for easy tab identification
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

## Direct/Bookmark Link Capabilities

- **Status**: Fixed
- **Priority**: High
- **Description**: Ensure any frontend route can be loaded independently without navigation context
- **Current State**: All detail pages now support direct URL access with fallback data fetching
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

## Success/Error/Warning/Info Components

- **Status**: Pending
- **Priority**: High
- **Description**: Create reusable feedback components for consistent user messaging
- **Current State**: Using `window.alert()` and inconsistent error displays
- **Needed Work**:
  - Create `SuccessMessage` component (green, check icon)
  - Create `ErrorMessage` component (red, X icon)
  - Create `WarningMessage` component (yellow, warning icon)
  - Create `InfoMessage` component (blue, info icon)
  - Create modal/toast system for non-blocking notifications
  - Replace all `window.alert()` calls with appropriate components
  - Replace inline error text with `ErrorMessage` component
  - Example: "Add to Playlist" should show success modal instead of alert
- **Technical Notes**:
  - Place components in `client/src/components/ui/`
  - Support both inline and modal/toast display modes
  - Auto-dismiss after configurable timeout for toasts
  - Consider using a library like `react-hot-toast` or build custom
  - Ensure Tailwind styling matches app theme
- **Benefit**: Visual consistency, better UX, more professional appearance

## Logging System Implementation

- **Status**: Fixed
- **Priority**: High
- **Description**: Implement proper logging levels and reduce log spam
- **Current State**: Structured logging system implemented with Winston, Video.js logging reduced to warn level
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

---

# MEDIUM PRIORITY

## Segment State Tracking Enhancement

- **Status**: Pending
- **Priority**: Medium
- **Description**: Implement granular segment state tracking with status enum
- **Current State**: Segments tracked as completed (Set) but no intermediate states
- **Needed Work**:
  - Define segment state enum: `waiting`, `transcoding`, `completed`, `failed`
  - Change `completedSegments` from `Set<number>` to `Map<number, SegmentState>`
  - Track segment state transitions in TranscodingManager
  - Add retry logic for failed segments
  - Expose segment state via API for debugging/monitoring
  - Update playlist monitor to handle new states
- **Technical Notes**:
  - File: `server/services/TranscodingManager.ts`
  - Consider adding `lastError` field for failed segments
  - May want segment timestamps (startTime, completedTime)
- **Benefit**: Better debugging, progress tracking, ability to retry failed segments

## Playlist Status Card on Scene Page

- **Status**: Pending
- **Priority**: Medium
- **Description**: Show playlist context when viewing a scene that's part of a playlist
- **Current State**: No indication that scene is part of playlist when viewing scene page
- **Needed Work**:
  - Detect if current scene is part of a playlist
  - Create `PlaylistStatusCard` component showing:
    - Playlist title
    - Current position (e.g., "Video 3 of 12")
    - Thumbnails/list of other videos in playlist
    - Quick navigation to any video in playlist
    - Previous/Next buttons
  - Place card prominently on Scene page
  - Handle URL params for playlist context
- **Technical Notes**:
  - File: `client/src/components/pages/Scene.jsx` or `SceneDetails.jsx`
  - May need to pass playlist info via URL query params
  - Component location: `client/src/components/playlist/PlaylistStatusCard.jsx`
- **Benefit**: Better binge-watching experience, easier playlist navigation

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

## Convenience API Methods

- **Status**: Pending
- **Priority**: Medium
- **Description**: Add convenience methods for fetching single entities by ID
- **Current State**: Must use `findPerformers()` and extract first result for single performer
- **Needed Work**:
  - Add `findPerformerById(id)` method that returns performer object or `null`
  - Add `findSceneById(id)` method
  - Add `findStudioById(id)` method
  - Add `findTagById(id)` method
  - Each method calls corresponding `find*` method with ID filter
  - Returns single entity or `null` if not found
  - Add TypeScript types for return values
- **Technical Notes**:
  - File: `client/src/services/libraryApi.js` (or `.ts` if TypeScript)
  - Example: `async findPerformerById(id) { const result = await this.findPerformers({ ids: [id] }); return result.data[0] || null; }`
  - Verify all `find` methods support `ids` filter
- **Benefit**: Cleaner code, less boilerplate for single-entity fetching

## Playlist Management Enhancements

- **Status**: Pending
- **Priority**: Medium
- **Description**: Enhanced playlist features beyond basic playback
- **Current State**: Basic playlist playback exists
- **Needed Work**:
  - Create custom playlists (not just from Stash)
  - Shuffle mode toggle
  - Repeat mode options (repeat one, repeat all, no repeat)
  - Save/load playlist state (resume playlist later)
  - Edit playlist order (drag-and-drop reordering)
  - Add/remove videos from playlist
  - Database schema for storing custom playlists
  - UI for managing playlists
- **Technical Notes**:
  - Need new database table: `Playlist` and `PlaylistItem`
  - Files: `client/src/components/pages/Playlists.jsx`, `PlaylistEditor.jsx`
  - Consider using DnD library like `react-beautiful-dnd` or `dnd-kit`
- **Benefit**: Better binge-watching experience, easier playlist navigation

## Build and Performance Optimizations

- **Status**: Pending
- **Priority**: Medium
- **Description**: Optimize build process and runtime performance
- **Current State**: Development build settings, no minification or optimization
- **Needed Work**:
  - Enable minification for production builds (Vite/Webpack config)
  - Implement code splitting for routes (React lazy loading)
  - Implement lazy loading for heavy components (video player)
  - Enable tree shaking to remove unused code
  - Optimize assets (compress images, optimize fonts)
  - Run bundle size analysis (`vite-bundle-visualizer`)
  - Configure production build optimizations
  - Server-side: Add response caching, compress responses
- **Technical Notes**:
  - Files: `client/vite.config.js`, `client/src/App.jsx` (routes)
  - Use `React.lazy()` and `Suspense` for code splitting
  - Vite does most of this automatically, verify configuration
  - Consider `vite-plugin-compression` for gzip/brotli
- **Benefit**: Faster page loads, smaller bundle sizes, better production performance

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

---

## How to Use This Document

**For Claude Code**:
- Pick items marked as `Pending` to work on
- Avoid `Blocked` items until manual inspection is complete
- Update status to `In Progress` when starting work
- Change to `Fixed` when complete
- Ask clarifying questions if Technical Notes are unclear

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
