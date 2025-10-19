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

- **Status**: Fixed
- **Priority**: Low (completed)
- **Description**: Comprehensive sort and filter system for all browsing pages
- **Completed Work**:
- **Available Sort Fields** (from Stash GraphQL API):
  - **Scenes**: bitrate, created_at, date, duration, filesize, framerate, last_o_at, last_played_at, path, performer_count, play_count, play_duration, random, rating, tag_count, title, updated_at
  - **Performers**: birthdate, career_length, created_at, height, last_o_at, last_played_at, measurements, name, o_counter, penis_length, play_count, random, rating, scenes_count, updated_at, weight
  - **Studios**: created_at, name, random, rating, scenes_count, updated_at
  - **Tags**: created_at, name, random, scenes_count, updated_at
- **Available Filters** (from Stash GraphQL API):
  - **Scene Filters**:
    - Date fields (date, created_at, last_played_at, updated_at) - modifiers: GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN
    - Duration fields (duration, play_duration) - format: hh:mm:ss.ms
    - Text search (audio_codec, details, director, title) - modifier: INCLUDES
    - Boolean (favorite, organized, performer_favorite) - true/false
    - Numeric (bitrate, framerate, play_count, o_counter, rating100, performer_age, performer_count, tag_count) - modifiers: EQUALS, GREATER_THAN, LESS_THAN
    - Resolution (360p, 480p, 540p, 720p, 1080p, 1440p, 4k) - modifiers: EQUALS, GREATER_THAN, LESS_THAN
    - Relations (performers, tags, studios) - modifier: INCLUDES, INCLUDES_ALL with depth
  - **Performer Filters**: birthdate, death_date, created_at, updated_at (dates), details/name/ethnicity/etc (text search), favorite (boolean), age/height/rating/etc (numeric), gender (MALE/FEMALE)
  - **Studio Filters**: created_at, updated_at (dates), details/name (text search), favorite (boolean), rating100/scene_count (numeric)
  - **Tag Filters**: created_at, updated_at (dates), description/name (text search), favorite (boolean), scene_count (numeric)
  - **Complete sort system** with 18+ sort options per artifact type
  - **Ascending/descending toggle** with visual indicator
  - **Comprehensive filter panel** with 20+ filter types for scenes
  - **Filter types supported**: checkbox, select, text, range, date-range
  - **Active filter chips** showing currently applied filters with one-click removal
  - **URL persistence** - all sort/filter state saved to URL query params for bookmarking and sharing
  - **Saved filter presets** - users can save, load, and delete custom filter configurations
  - **Per-artifact presets** - separate saved presets for scenes, performers, studios, and tags
  - **Manual apply** - filters only apply when user clicks "Apply Filters" button
  - **Works on all pages**: Scenes, Performers, Studios, Tags
- **Completed Features**:
  - Sort dropdown with all available GraphQL fields per entity type
  - Collapsible filter panel with grid layout
  - Clear All Filters button
  - Active filter count badge on Filters button
  - Active filter chips with remove buttons
  - URL query parameter persistence (shareable links)
  - Save Preset dialog with name input
  - Load Preset dropdown with delete buttons
  - Filter presets stored per user in database
  - Presets sync across all devices for the user
- **Technical Implementation**:
  - **Components Created**:
    - `client/src/components/ui/ActiveFilterChips.jsx` - Removable filter badges
    - `client/src/components/ui/FilterPresets.jsx` - Save/load preset UI
    - `client/src/utils/urlParams.js` - URL serialization/deserialization utilities
  - **Components Modified**:
    - `client/src/components/ui/SearchControls.jsx` - Integrated all features
    - `client/src/components/ui/FilterControls.jsx` - Filter panel components
    - `client/src/utils/filterConfig.js` - Already had comprehensive filter definitions
  - **Backend**:
    - `server/prisma/schema.prisma` - Added `filterPresets Json?` field to User model
    - `server/prisma/migrations/20250119000000_add_filter_presets/migration.sql` - Database migration
    - `server/controllers/user.ts` - Added `getFilterPresets`, `saveFilterPreset`, `deleteFilterPreset` endpoints
    - `server/routes/user.ts` - Added routes for filter preset management
  - **Database**: Filter presets stored as JSON: `{scene: [{id, name, filters, sort, direction, createdAt}], performer: [...], studio: [...], tag: [...]}`
  - **URL Format**: `?sort=rating&dir=DESC&page=2&q=search&favorite=true&duration_min=10&duration_max=30`
  - **React Router**: Uses `useSearchParams` hook for URL state management
- **Benefit**: Powerful content discovery, shareable filtered views, personalized saved searches, professional filtering UX

## Homepage Carousel Customization

- **Status**: Fixed
- **Priority**: Low
- **Description**: Allow user customization of homepage carousels
- **Completed Work**:
  - Added `carouselPreferences` JSON field to User database schema
  - Created database migration for the new field
  - Set default carousel preferences on user creation (8 carousels, all enabled)
  - Updated getUserSettings and updateUserSettings API endpoints to handle carousel preferences
  - Added comprehensive validation for carousel preference format (id/enabled/order)
  - Created CarouselSettings component with HTML5 drag-and-drop for reordering
  - Toggle carousel visibility with eye icon button
  - Save/Cancel buttons appear only when changes are made
  - Homepage fetches user preferences and filters/sorts carousels accordingly
  - Integrated carousel settings into user settings page
  - All 8 existing carousel types are customizable
- **Current Carousels**:
  - High Rated - Top rated scenes
  - Recently Added - Newly added content
  - Feature Length - Longer duration scenes
  - High Bitrate - Highest quality videos
  - Barely Legal - 18 year old performers
  - Favorite Performers - Scenes with favorite performers
  - Favorite Studios - Content from favorite studios
  - Favorite Tags - Scenes with favorite tags
- **Technical Implementation**:
  - Database: `server/prisma/schema.prisma` - added carouselPreferences JSON field
  - Migration: `server/prisma/migrations/20250118000000_add_carousel_preferences/migration.sql`
  - Backend: `server/controllers/user.ts` - carousel preference handling with validation
  - Component: `client/src/components/settings/CarouselSettings.jsx` - drag-and-drop UI
  - Updated: `client/src/components/pages/Home.jsx` - fetches and applies user preferences
  - Updated: `client/src/components/pages/Settings.jsx` - integrated carousel settings section
  - Carousel preferences stored as JSON array: `[{id: string, enabled: boolean, order: number}]`
  - Default preferences inlined in user.ts to avoid ESM loading issues
  - Homepage filters disabled carousels and sorts by user's preferred order
  - Drag-and-drop uses native HTML5 events with visual feedback (opacity changes)
- **Benefit**: Personalized homepage, users control which carousels they see and in what order

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

- **Status**: Fixed
- **Priority**: Low (originally), upgraded during implementation
- **Description**: Comprehensive keyboard navigation for entire app including TV remote support
- **Completed Work**:
  - **Spatial Grid Navigation**: 2D arrow key navigation for scene grids (Netflix-style)
  - **Media Key Support**: Play/pause, next/prev track, seek, volume control
  - **Focus Management**: Auto-focus on page load, focus trapping in modals
  - **Visual Indicators**: Prominent blue glow with pulsing animation for focused elements
  - **Complete Coverage**: Works on Scenes page, Scene detail page, and all grids
  - Created reusable hooks: `useSpatialNavigation`, `useMediaKeys`, `useFocusTrap`, `useInitialFocus`
  - Added comprehensive keyboard navigation documentation
- **Implemented Features**:
  - Scene grid: Arrow keys (2D spatial), Enter/Space (select), PageUp/Down (pagination), Home/End
  - Video player: Space (play/pause), M (mute), F (fullscreen), Ctrl+arrows (seek/volume)
  - Playlist: Media next/prev keys for playlist navigation
  - Modals: Tab cycling, Escape to close, focus trapping
  - Auto-focus: First meaningful element focused on page load
- **Technical Implementation**:
  - **Hooks**: `client/src/hooks/useSpatialNavigation.js` - Reusable 2D grid navigation
  - **Hooks**: `client/src/hooks/useMediaKeys.js` - Media key handling with playlist support
  - **Hooks**: `client/src/hooks/useFocusTrap.js` - Modal focus trapping and initial focus
  - **Styling**: `client/src/index.css` - TV-friendly focus indicators with glow effect
  - **Updated Components**: SceneGrid.jsx, VideoPlayer.jsx, Scene.jsx, Scenes.jsx, ConfirmDialog.jsx
  - Works with keyboards, media remotes, Bluetooth controllers, and TV remotes
  - Respects text input fields (arrow keys work normally in search boxes)
  - Smooth scrolling to keep focused items visible
  - Accessibility-friendly with ARIA labels
- **Documentation**:
  - Created comprehensive keyboard navigation guide: `docs/user-guide/keyboard-navigation.md`
  - Updated README.md with keyboard navigation feature
  - Includes quick reference table and troubleshooting section
- **Benefit**: Full TV remote control support, power user efficiency, accessibility improvements, 10-foot UI experience

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

- **Status**: Fixed
- **Priority**: Low
- **Description**: Reduce Docker image size and build time
- **Completed Work**:
  - Upgraded Node version from 18-slim to 22-slim (latest LTS)
  - Changed from `npm install` to `npm ci` for reproducible builds
  - Added `--omit=dev` in production stage to exclude dev dependencies
  - Improved layer caching by copying package files before source
  - Extracted nginx config and startup script to separate files
  - Enhanced `.dockerignore` with comprehensive exclusions
  - Added healthcheck for container monitoring
  - Optimized apt-get with `--no-install-recommends`
  - Combined RUN commands to reduce layers
  - Created external config files (`docker/nginx.conf`, `docker/start.sh`)
  - Added runtime optimizations (NODE_OPTIONS, curl for healthcheck)
- **Final Image Size**: 1.57GB (reasonable for full-stack app with FFmpeg)
- **Technical Implementation**:
  - Files updated: `Dockerfile.production`, `.dockerignore`
  - Files created: `docker/nginx.conf`, `docker/start.sh`, `DOCKER_OPTIMIZATION.md`
  - Three-stage build: frontend-build, backend-build, production
  - Frontend stage: npm ci, build optimized React app
  - Backend stage: includes build tools (python3, make, g++), compiles TypeScript
  - Production stage: only runtime deps (ffmpeg, nginx, sqlite3, curl)
  - Build command: `docker build -f Dockerfile.production -t peek-stash-browser:optimized .`
- **Benefits Achieved**:
  - Latest Node LTS with security patches and performance improvements
  - Reproducible builds with npm ci
  - Smaller runtime image (no dev dependencies)
  - Better build caching (faster rebuilds when only code changes)
  - More maintainable (config files separate from Dockerfile)
  - Container health monitoring via healthcheck
  - Improved startup logging
- **Documentation**: See `DOCKER_OPTIMIZATION.md` for detailed summary
- **Future Considerations** (optional):
  - Consider Alpine base image (requires testing with native npm modules)
  - Multi-architecture builds for ARM support
  - Security scanning with `docker scan`
  - Analyze FFmpeg codecs to potentially reduce size
- **Benefit**: Faster deployments, better security, easier maintenance, reproducible builds

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

### Multiselect Mode for Scene Grids

- **Priority**: Medium
- **Description**: Select multiple scenes from grids for bulk actions, starting with bulk playlist additions
- **Status**: Fixed
- **Completed Work**:
  - Toggle button to enter/exit multiselect mode on all scene grids
  - Checkbox overlays on scene cards in multiselect mode
  - "Select All" button to select all scenes on current page
  - Visual selection feedback (blue ring border on selected cards)
  - Bottom-fixed bulk action bar showing selection count and actions
  - Bulk "Add to Playlist" with aggregate feedback (added count, skipped count)
  - Keyboard navigation works in multiselect (Space/Enter toggles selection)
  - Selections automatically clear when changing pages or exiting mode
  - Works across all scene grids (Scenes page, Home carousels, Performer/Studio/Tag detail)
- **Technical Implementation**:
  - **New Components**:
    - `client/src/components/ui/BulkActionBar.jsx` - Fixed bottom bar with selection info and actions
  - **Modified Components**:
    - `client/src/components/scene-search/SceneGrid.jsx` - Multiselect state management, toggle button, select all
    - `client/src/components/ui/SceneCard.jsx` - Checkbox overlay, selection visual feedback, mode-aware handlers
    - `client/src/components/ui/AddToPlaylistButton.jsx` - Support for multiple scenes via sceneIds array, configurable dropdown position (above/below)
  - **State Management**: React useState for multiselect mode flag and selected scenes array
  - **Keyboard Support**: Modified spatial navigation hook callback to respect multiselect mode
  - **Dropdown Position**: Added `dropdownPosition="above"` prop for bottom-fixed buttons (prevents off-screen menus)
- **Benefit**: Efficient bulk operations, especially for adding multiple scenes to playlists, reduces repetitive clicking

### Virtual Playlist Navigation for Grids and Carousels

- **Priority**: Medium
- **Description**: Treat scene grids and carousels as navigable playlists when viewing scenes
- **Status**: Fixed
- **Completed Work**:
  - Click any scene from search results → navigate through all search results using next/prev
  - Click any scene from carousel → navigate through all carousel scenes
  - Click from performer/studio/tag page → navigate through all filtered scenes
  - Virtual playlist preserves original grid/carousel order
  - Playlist controls work identically to real playlists
  - Contextual naming ("Scene Grid", "High Rated", "Performer: Jane Doe", etc.)
  - Automatic playlist context creation on scene click
- **Technical Implementation**:
  - **Modified Components**:
    - `client/src/components/scene-search/SceneSearch.jsx` - Creates virtual playlist on handleSceneClick
    - `client/src/components/pages/Home.jsx` - Creates per-carousel virtual playlists
  - **Virtual Playlist Structure**:
    - id: "virtual-grid" or "virtual-carousel" (distinguishes from real playlists)
    - name: Descriptive name based on source (page title or carousel title)
    - shuffle: false (preserves grid order)
    - repeat: "none" (default behavior)
    - scenes: Full array with position metadata
    - currentIndex: Position of clicked scene
  - **Integration**: Reuses existing playlist navigation infrastructure (PlaylistStatusCard, next/prev controls)
  - **Coverage**: All pages using SceneSearch automatically benefit (Scenes, Performer, Studio, Tag detail)
- **Benefit**: Seamless browsing through search results and carousels without creating real playlists, maintains context and order

### Playlist Navigation Fixes

- **Priority**: High
- **Description**: Fix broken playlist navigation controls and improve virtual playlist UX
- **Status**: Fixed
- **Completed Work**:
  - Fixed Next/Previous buttons (were navigating to wrong route `/scene/` instead of `/video/`)
  - Fixed thumbnail navigation (click any thumbnail to jump to that scene)
  - Hidden "View Full Playlist" button for virtual playlists (prevents dead link)
  - Updated header text for virtual playlists ("Browsing" instead of "Playing from Playlist")
  - Made playlist name non-clickable for virtual playlists
  - Fixed Scene component to update when navigating between scenes (watches location.state changes)
  - Added useEffect to detect location.state changes and update scene/playlist state
- **Technical Implementation**:
  - **Modified Components**:
    - `client/src/components/playlist/PlaylistStatusCard.jsx`:
      - Changed navigation route from `/scene/${id}` to `/video/${id}` (line 24)
      - Added `isVirtualPlaylist` check (playlist.id?.startsWith?.("virtual-"))
      - Conditionally hide "View Full Playlist" button for virtual playlists
      - Conditional header text and playlist name rendering
    - `client/src/components/pages/Scene.jsx`:
      - Added useEffect watching location.state for navigation updates
      - Made playlist state settable (changed from const to useState)
      - Updates scene, playlist, loading, and error state on location.state changes
      - Fixed fetch effect to check location.state instead of removed variable
- **Benefit**: Fully functional playlist navigation for both real and virtual playlists, no dead links, clear UX distinction

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

### Sprite Sheet Thumbnail Previews

- **Priority**: Medium
- **Description**: YouTube-style seek bar previews and Netflix-style scene card previews using Stash's sprite sheets
- **Status**: Fixed
- **Completed Work**:
  - Created sprite sheet parsing utilities for VTT files and position calculations
  - Implemented SeekPreview component for video player seek bar hover tooltips
  - Implemented SceneCardPreview component for animated scene card previews
  - Both components gracefully fall back to static screenshots when sprite data unavailable
  - Seek bar shows live thumbnail + timestamp tooltip on hover
  - Scene cards cycle through 10 evenly-spaced thumbnails on hover (600ms interval)
  - Proper sprite scaling with CSS transforms for responsive containers
  - Published stashapp-api v0.2.11 with VTT field support
  - Fixed pointer-events blocking on scene card overlays
  - Simplified scene grid to 320px minimum width with auto-fill responsive layout
  - Updated user documentation with preview feature descriptions
- **Technical Implementation**:
  - **New Components**:
    - `client/src/utils/spriteSheet.js` - VTT parsing and sprite position utilities
    - `client/src/components/ui/SpritePreview.jsx` - Reusable sprite display component
    - `client/src/components/video-player/SeekPreview.jsx` - Seek bar hover tooltip
    - `client/src/components/ui/SceneCardPreview.jsx` - Animated scene card preview with cycling
  - **Modified Components**:
    - `client/src/components/video-player/VideoPlayer.jsx` - Integrated SeekPreview
    - `client/src/components/ui/SceneCard.jsx` - Integrated SceneCardPreview, fixed pointer-events on gradient overlay
    - `client/src/themes/base.css` - Changed grid from fixed columns to `repeat(auto-fill, minmax(320px, 1fr))`
  - **Library Updates**:
    - `stashapp-api` v0.2.11 - Added `vtt` field to Scene paths query
    - `server/package.json` - Updated dependency to stashapp-api@0.2.11
  - **Sprite Sheet Parsing**:
    - `parseVTT()` - Parses WebVTT format with xywh coordinates
    - `getSpritePositionForTime()` - Binary search for sprite at specific timestamp
    - `getEvenlySpacedSprites()` - Extracts evenly distributed sprites for cycling
    - `extractSpritePosition()` - DRY helper for position extraction
  - **Sprite Display Techniques**:
    - SeekPreview: Uses SpritePreview component with fixed 160px width
    - SceneCardPreview: Measures container width dynamically, scales sprite with CSS transform
    - Container with overflow hidden clips sprite sheet to show only one thumbnail
    - Positioning: `left: -${x * scale}px, top: -${y * scale}px` with `transform: scale(${scale})`
  - **Performance**:
    - Sprite sheet image preloaded once per component
    - ResizeObserver tracks container width changes
    - Cycle interval optimized at 600ms for smooth browsing
    - Loading states with spinner during image load
  - **Documentation**:
    - `docs/user-guide/video-playback.md` - Added sprite preview section for seek bar
    - `docs/user-guide/search-browse.md` - Added scene card preview description
    - `README.md` - Added "Visual Previews" to features list
- **Benefit**: Professional streaming UX matching YouTube/Netflix, faster content discovery, precise seeking with visual feedback, no additional media generation required

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

**Last Updated**: 2025-10-19
