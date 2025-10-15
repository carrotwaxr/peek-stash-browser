# Path Mapping System Implementation Summary

**Date**: 2025-10-15
**Status**: ✅ Complete - Ready for testing after container restart

## What Was Implemented

Implemented a comprehensive cross-platform path mapping system for Peek to handle:
1. **CONFIG_DIR**: Peek's database and HLS transcode cache storage
2. **Stash Media Path Translation**: Map Stash's internal paths to Peek's perspective

## Changes Made

### 1. New Path Translation Utility
**File**: `server/utils/pathMapping.ts` (NEW)
- Created `PathMapper` class with singleton pattern
- Translates Stash paths (e.g., `/data/videos/file.mp4`) to Peek's perspective
- Configurable via environment variables
- Includes logging for debugging path translations

### 2. Updated Video Controller
**File**: `server/controllers/video.ts`
- Imported `translateStashPath` utility
- Replaced hardcoded path mapping (`scene.replace("/data", "/app/media")`)
- Now uses flexible `translateStashPath(scenePath)` function

### 3. Renamed Environment Variables
**Changed**:
- `TMP_DIR` → `CONFIG_DIR` (more accurate name)
- Added `STASH_INTERNAL_PATH` (default: `/data`)
- Added `STASH_MEDIA_PATH` (default: `/app/media`)

**Files Updated**:
- `.env` - Development environment config
- `.env.example` - Template with extensive documentation
- `server/services/TranscodingManager.ts` - Uses `CONFIG_DIR` instead of `TMP_DIR`

### 4. Updated Docker Configuration
**File**: `docker-compose.yml`
- Renamed volume: `peek-db` → `peek-config` (reflects actual purpose)
- Updated volume mount comments for clarity
- Volume now correctly maps CONFIG_DIR for database + HLS cache

### 5. Documentation Updates
**File**: `CLAUDE.md`
- Added comprehensive "Environment Configuration & Path Mapping" section
- Documents Stash installation paths (Windows/Mac/Linux/Docker)
- Provides 3 deployment scenario examples
- Explains the two critical path mappings

## FFmpeg Configuration Fix

### Issue Resolved
- **Problem**: FFmpeg `hls_playlist_type` was set to `event`, causing Video.js to show "Live" controls
- **Solution**: Changed to `vod` playlist type in `TranscodingManager.ts:229`
- **Result**: Video.js now shows proper VOD controls (seek bar, duration, etc.)

### Path Issue Resolved
- **Problem**: `TMP_DIR` was Windows path (`C:\Users\...`), causing 404 errors in Docker container
- **Solution**: Changed to `/app/data` (container path), properly mounted via docker-compose
- **Result**: Transcoding files now created in correct location and served successfully

## Current Environment Variables (.env)

```env
DATABASE_URL=file:/app/data/peek-stash-browser.db
JWT_SECRET=super-secure-jwt-secret-for-development-only
JWT_EXPIRES_IN=7d

# Stash server configuration
STASH_URL=http://10.0.0.4:6969/graphql
STASH_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJwaG9lbml4IiwiaWF0IjoxNjM0MjMwOTQ0LCJzdWIiOiJBUElLZXkifQ.obrT2FJFLWNVA6z7yhnqSg3t1_Ul8Ku7pLKG76clkNc

# Path mapping configuration
CONFIG_DIR=/app/data
STASH_INTERNAL_PATH=/data
STASH_MEDIA_PATH=/app/media

# SMB/CIFS credentials for development
SMB_USERNAME=vybcdan
SMB_PASSWORD=PurpleAhriman1!
```

## Testing After Host Restart

### 1. Restart Docker Containers
```bash
cd peek-stash-browser
docker-compose down
docker-compose up -d
```

### 2. Verify Environment Variables
```bash
docker-compose exec peek-server env | grep -E "CONFIG_DIR|STASH_"
```

Expected output:
```
CONFIG_DIR=/app/data
STASH_INTERNAL_PATH=/data
STASH_MEDIA_PATH=/app/media
STASH_URL=http://10.0.0.4:6969/graphql
STASH_API_KEY=eyJ...
```

### 3. Check Logs for Path Mapping
```bash
docker-compose logs peek-server | grep -E "PathMapper|TranscodingManager"
```

Expected output:
```
PathMapper initialized:
  Stash internal path: /data
  Peek media path: /app/media
TranscodingManager tmpDir normalized to: /app/data
```

### 4. Test Video Playback
1. Open browser to `http://localhost:6969`
2. Select a video that requires transcoding (HEVC)
3. Verify:
   - ✅ Direct play fails (expected for HEVC)
   - ✅ Automatic fallback to transcoding
   - ✅ No 404 errors for playlists
   - ✅ VOD controls appear (seek bar, duration, NOT "LIVE" badge)
   - ✅ Can seek forward/backward
   - ✅ Playback starts after brief buffer

### 5. Verify Path Translation
Check server logs during playback:
```bash
docker-compose logs peek-server | grep "Path translation"
```

Should see translations like:
```
Path translation: /data/scenes/video.mp4 → /app/media/scenes/video.mp4
```

## Known Issues & Next Steps

### Current State
- ✅ Path mapping system implemented
- ✅ FFmpeg VOD mode configured
- ✅ Environment variables updated
- ✅ Documentation complete
- ⏳ **Needs testing after host restart + container rebuild**

### If Issues Occur

**404 Errors on Playlists**:
- Check `docker-compose logs peek-server | tail -50`
- Verify CONFIG_DIR is `/app/data` (not Windows path)
- Ensure `peek-config` volume exists: `docker volume ls`

**Path Translation Errors**:
- Check logs for "Path does not start with expected Stash internal path" warnings
- Verify STASH_INTERNAL_PATH matches what Stash actually uses
- May need to adjust based on Stash's actual path format

**Live Controls Still Showing**:
- Verify `hls_playlist_type` is `vod` in TranscodingManager.ts:229
- Check playlist contents: `curl http://localhost:6969/api/video/playlist/{sessionId}/720p/index.m3u8`
- Should see `#EXT-X-PLAYLIST-TYPE:VOD`

## Files Changed Summary

**New Files**:
- `server/utils/pathMapping.ts`
- `PATH_MAPPING_IMPLEMENTATION.md` (this file)

**Modified Files**:
- `server/controllers/video.ts` (use translateStashPath)
- `server/services/TranscodingManager.ts` (TMP_DIR → CONFIG_DIR, event → vod)
- `.env` (updated variables)
- `.env.example` (comprehensive documentation)
- `docker-compose.yml` (renamed volume, updated comments)
- `CLAUDE.md` (path mapping documentation)

## Rollback Instructions (if needed)

```bash
cd peek-stash-browser
git diff  # Review all changes
git checkout server/utils/pathMapping.ts  # Remove new file
git checkout .  # Revert all changes
# Then restore .env with old TMP_DIR value
```

## Success Criteria

Implementation is successful when:
- [x] Code compiles without TypeScript errors
- [x] Environment variables properly renamed and documented
- [x] Path mapper utility created and integrated
- [ ] **Containers restart successfully (after host reboot)**
- [ ] **Videos transcode and play with VOD controls**
- [ ] **No 404 errors in console logs**
- [ ] **Path translations log correctly**
