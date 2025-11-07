# Video Preview Implementation Plan for Peek

## Research Summary

### Stash Preview Types Available

Based on analysis of Stash source code (`C:\Users\charl\code\stash`), Stash generates 3 types of previews:

#### 1. **Video Preview (MP4)** - Highest Quality
- **Path**: `{stash_screenshots_dir}/{checksum}.mp4`
- **GraphQL Field**: `scene.paths.preview`
- **Generation**: Multi-segment preview stitched together
- **Specifications**:
  - Default: 12 segments × 2 seconds = 24 seconds total
  - Width: 640px (maintains aspect ratio)
  - Codec: H.264 (libx264)
  - CRF: 21 (high quality)
  - Preset: Configurable (ultrafast → veryslow)
  - Audio: Optional (default: no audio, 128k AAC if enabled)
  - Can exclude start/end portions of video
- **Generation Code**: `pkg/scene/generate/preview.go::PreviewVideo()`
- **Quality**: **HIGHEST** - Best for hover previews on cards

#### 2. **WebP Preview** - Medium Quality
- **Path**: `{stash_screenshots_dir}/{checksum}.webp`
- **GraphQL Field**: `scene.paths.webp`
- **Generation**: Converted FROM the MP4 video preview
- **Specifications**:
  - Width: 640px
  - FPS: 12 (downsampled from video preview)
  - Compression: Lossless (level 6)
  - Quality: 70
  - Loop: Infinite
- **Generation Code**: `pkg/scene/generate/preview.go::PreviewWebp()`
- **Quality**: **MEDIUM** - Smaller than MP4 but lower quality

#### 3. **Sprite Sheet + VTT** - Lowest Quality (Currently Used)
- **Paths**:
  - `{stash_vtt_dir}/{checksum}_sprite.jpg`
  - `{stash_vtt_dir}/{checksum}_thumbs.vtt`
- **GraphQL Fields**: `scene.paths.sprite`, `scene.paths.vtt`
- **Generation**: 9×9 grid of static thumbnails (81 frames)
- **Specifications**:
  - Thumbnail width: 160px (vs 640px for video/webp)
  - Grid: 9 columns × 9 rows
  - Total: 81 evenly-spaced frames
- **Current Use in Peek**: Card hover previews (cycles through 5 sprites)
- **Quality**: **LOWEST** - Small, choppy, low resolution

---

## Quality Comparison

| Preview Type | Resolution | FPS | Smoothness | File Size | Quality Rank |
|-------------|-----------|-----|-----------|-----------|--------------|
| Video (MP4) | 640px | 24-60 | ✓✓✓ Smooth video | Largest | 🥇 **Best** |
| WebP | 640px | 12 | ✓✓ Acceptable | Medium | 🥈 Good |
| Sprite Sheet | 160px | ~1-2 (cycling) | ✗ Choppy | Smallest | 🥉 Lowest |

**Current State**: Peek only uses sprite sheets (lowest quality)
**Goal**: Prefer video previews when available, fallback to webp → sprites

---

## Implementation Plan

### Phase 1: Update GraphQL Schema & Data Fetching

#### 1.1 Update stashapp-api (npm package)

**Files to Modify**:
- `stashapp-api/src/operations/findScenes.graphql`
- `stashapp-api/src/operations/findSceneById.graphql`

**Changes**:
```graphql
# Add to ScenePathsFragment or inline in queries
paths {
  screenshot
  preview    # ← ADD (MP4 video preview)
  webp       # ← ADD (WebP animated preview)
  sprite
  vtt
  stream
}
```

**Workflow**:
1. Edit `.graphql` files to add `preview` and `webp` fields
2. Run `npm run codegen` to regenerate TypeScript types
3. Run `npm run build` to compile
4. Commit changes (only source `.graphql` files, not generated code)
5. Run `npm run publish:patch` to bump version and publish
6. Update `peek-stash-browser/server/package.json` to use new version
7. Run `npm install stashapp-api@{new-version}` in server directory

**Impact**: All scene queries will now include preview URLs

---

#### 1.2 Update Peek Server Types

**Files to Modify**:
- `peek-stash-browser/server/types/nested.ts` (if NormalizedScene type exists)

**Changes**:
```typescript
export interface ScenePaths {
  screenshot?: string;
  preview?: string;    // ← ADD
  webp?: string;       // ← ADD
  sprite?: string;
  vtt?: string;
  stream?: string;
}
```

**Note**: Types may auto-update from stashapp-api import

---

### Phase 2: Update Proxy Endpoints

#### 2.1 Add Video Preview Proxy Route

**File**: `peek-stash-browser/server/controllers/proxy.ts`

**Current Routes**:
- `/api/proxy/scene/{id}/screenshot`
- `/api/proxy/scene/{id}/sprite`
- `/api/proxy/scene/{id}/vtt`
- `/api/proxy/scene/{id}/stream`

**Add Routes**:
```typescript
// GET /api/proxy/scene/:id/preview - MP4 video preview
router.get('/scene/:id/preview', async (req, res) => {
  const { id } = req.params;
  const stashUrl = `${STASH_URL}/scene/${id}/preview`;
  await proxyStashFile(stashUrl, res);
});

// GET /api/proxy/scene/:id/webp - WebP animated preview
router.get('/scene/:id/webp', async (req, res) => {
  const { id } = req.params;
  const stashUrl = `${STASH_URL}/scene/${id}/webp`;
  await proxyStashFile(stashUrl, res);
});
```

**Why Proxy**: Same reasons as existing endpoints (path mapping, authentication)

---

### Phase 3: Frontend - Enhance SceneCardPreview Component

#### 3.1 Create Preview Fallback Chain

**File**: `peek-stash-browser/client/src/components/ui/SceneCardPreview.jsx`

**Current Behavior**:
- Shows sprite preview on hover (desktop) or scroll (mobile)
- Falls back to static screenshot if no sprite/vtt

**New Behavior** (Priority Order):
1. **Video Preview (MP4)** - if `scene.paths.preview` exists
2. **WebP Preview** - if `scene.paths.webp` exists
3. **Sprite Preview** - if `scene.paths.sprite` + `vtt` exist (current)
4. **Static Screenshot** - fallback

**Implementation Strategy**:

```jsx
// Determine best available preview type
const previewType = useMemo(() => {
  if (scene?.paths?.preview) return 'video';    // Best
  if (scene?.paths?.webp) return 'webp';        // Good
  if (scene?.paths?.sprite && scene?.paths?.vtt) return 'sprite'; // Fallback
  return 'screenshot'; // Last resort
}, [scene?.paths]);
```

---

#### 3.2 Video Preview Implementation

**New Component**: `<VideoPreview>` (internal to SceneCardPreview)

**Features**:
- Autoplay on hover (desktop) or scroll into view (mobile)
- Muted by default
- Loop continuously while active
- Lazy load video element
- Preload strategy: `preload="metadata"` initially, `preload="auto"` on hover/scroll

**Example Code**:
```jsx
const VideoPreview = ({ src, isActive, onLoad, onError }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;

    if (isActive) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked - silence error
      });
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // Reset to start
    }
  }, [isActive]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      className="w-full h-full object-cover pointer-events-none"
      onLoadedData={onLoad}
      onError={onError}
    />
  );
};
```

**Considerations**:
- **Performance**: Video elements are heavy - need proper cleanup
- **Mobile Data**: Consider adding user preference to disable video previews
- **Bandwidth**: 640px MP4 previews are ~500KB-2MB each (vs ~50-200KB sprites)

---

#### 3.3 WebP Preview Implementation

**Implementation**: Similar to video, but use `<img>` with animated WebP

```jsx
const WebpPreview = ({ src, isActive }) => {
  return (
    <img
      src={isActive ? src : scene.paths.screenshot}
      alt={scene?.title || "Scene preview"}
      className="w-full h-full object-cover pointer-events-none"
      loading="lazy"
    />
  );
};
```

**Advantage over Video**:
- Smaller file size (~200-800KB)
- No autoplay restrictions
- Better browser support

**Disadvantage**:
- Lower quality than MP4 (12 FPS vs 24-60)
- Still heavier than sprites

---

### Phase 4: Performance Optimizations

#### 4.1 User Preferences

**File**: `peek-stash-browser/server/prisma/schema.prisma`

**Add to User Model**:
```prisma
model User {
  // ... existing fields

  // Preview preferences
  previewQuality String? @default("auto") // "auto", "video", "webp", "sprite", "screenshot"
  enableVideoPreviewsOnMobile Boolean @default(false) // Bandwidth consideration
}
```

**Settings UI**:
- Add to Server Settings page
- Options:
  - **Auto**: Video → WebP → Sprite → Screenshot (recommended)
  - **Video Only**: Video → Screenshot (highest quality, high bandwidth)
  - **WebP Only**: WebP → Screenshot (balanced)
  - **Sprite Only**: Sprite → Screenshot (lowest bandwidth, current behavior)
  - **Screenshot Only**: No animated previews (accessibility option)

---

#### 4.2 Lazy Loading Strategy

**Current**: Sprites load on hover/scroll
**New**: Stagger preview loading based on viewport proximity

```jsx
// Use Intersection Observer with different thresholds
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      if (entry.intersectionRatio > 0.5) {
        // Card is 50% visible - start preloading video metadata
        setPreloadState('metadata');
      }
      if (entry.intersectionRatio > 0.9) {
        // Card is 90% visible - preload full video
        setPreloadState('auto');
      }
    }
  });
}, { threshold: [0, 0.5, 0.9] });
```

---

#### 4.3 Caching Strategy

**Browser Caching**:
- Stash preview files don't change (content-addressed by checksum)
- Set aggressive cache headers in proxy:

```typescript
// In proxy.ts
res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
```

**Service Worker** (Future Enhancement):
- Cache video previews for offline access
- Pre-fetch previews for scenes in current view

---

### Phase 5: Backwards Compatibility & Migration

#### 5.1 Graceful Degradation

**Scenario**: User has Stash configured without video preview generation

**Handling**:
- Check `scene.paths.preview` existence
- Fall through priority chain automatically
- No errors, seamless degradation

**User Communication**:
- Add notice in Peek settings: "For best quality previews, enable 'Generate previews during scan' in Stash settings"
- Link to Stash documentation

---

#### 5.2 Stash Configuration Check

**Optional Enhancement**: Query Stash config to show generation status

```graphql
query {
  configuration {
    general {
      scanGeneratePreviews
      scanGenerateImagePreviews
      scanGenerateSprites
      previewSegments
      previewSegmentDuration
      previewAudio
      previewPreset
    }
  }
}
```

**Display in Peek Settings**:
- "Your Stash is configured to generate: ✓ Video, ✓ WebP, ✓ Sprites"
- "Recommendation: Enable video previews for best quality"

---

### Phase 6: Testing Plan

#### 6.1 Preview Type Coverage

Test matrix:

| Stash Config | Expected Peek Behavior |
|-------------|----------------------|
| Video + WebP + Sprite | Show video preview |
| WebP + Sprite only | Show webp preview |
| Sprite only | Show sprite preview (current) |
| None | Show static screenshot |

#### 6.2 Performance Testing

**Metrics to Monitor**:
- Page load time with video previews
- Memory usage with multiple video elements
- Network bandwidth consumption
- Mobile performance (especially older devices)

**Tools**:
- Chrome DevTools Performance tab
- Lighthouse audit
- Network throttling (3G/4G simulation)

---

## Implementation Phases Summary

### Minimal Viable Implementation (Phase 1-3)
**Effort**: 4-6 hours
- Update GraphQL queries to fetch preview/webp URLs
- Add proxy routes for video/webp previews
- Modify SceneCardPreview to prefer video → webp → sprite → screenshot
- Test with existing Stash instances

### Full Implementation (Phase 1-5)
**Effort**: 8-12 hours
- Everything in MVP
- User preferences for preview quality
- Performance optimizations (lazy loading, caching)
- Stash config detection and UI feedback
- Comprehensive testing

### Future Enhancements (Phase 6+)
**Effort**: Ongoing
- Service worker for offline caching
- Preview quality analytics (track which formats users prefer)
- Bandwidth estimation (warn on cellular connections)
- Support for scene markers video previews (separate endpoints)

---

## Technical Decisions & Trade-offs

### Decision 1: Proxy vs Direct URLs
**Choice**: Continue using proxy (same as current sprite implementation)
**Rationale**:
- Consistent auth handling
- Path mapping for Docker environments
- Centralized error handling
- Future: Could add preview transcoding in Peek (resize to smaller formats)

### Decision 2: Priority Order (Video → WebP → Sprite)
**Choice**: Prefer highest quality when available
**Rationale**:
- Users expect high-quality previews (industry standard: Netflix, YouTube, Plex)
- Disk space is cheap, user experience is valuable
- Provide settings for users with bandwidth constraints

### Decision 3: Autoplay Behavior
**Choice**: Keep current behavior (hover on desktop, scroll on mobile)
**Rationale**:
- Established pattern in Peek
- Works well with both sprite and video previews
- Respects user intent (explicit hover vs passive scroll)

### Decision 4: Audio in Previews
**Choice**: Always muted
**Rationale**:
- Unexpected audio is jarring UX
- Matches industry standards (all platforms mute hover previews)
- Stash defaults to no audio in previews anyway

---

## Risk Assessment

### High Risk
- **Bandwidth Usage**: Video previews are 10-20x larger than sprites
  - **Mitigation**: User preferences, mobile detection, lazy loading
- **Browser Performance**: Multiple video elements can cause lag
  - **Mitigation**: Limit concurrent video previews, aggressive cleanup

### Medium Risk
- **Stash Version Compatibility**: Older Stash versions may not have webp support
  - **Mitigation**: Graceful fallback chain handles missing formats
- **Mobile Data Costs**: Users on metered connections
  - **Mitigation**: Default to sprites on mobile, add warning in settings

### Low Risk
- **Implementation Complexity**: Relatively straightforward additions
- **Breaking Changes**: Fully backwards compatible

---

## Success Metrics

### User Experience
- **Preview Quality**: 640px video vs 160px sprite (4x improvement)
- **Smoothness**: 24 FPS video vs 1-2 FPS sprite cycling (12-24x improvement)
- **User Preference**: >80% of users prefer video previews (measure via analytics)

### Performance
- **Load Time**: <500ms to start video preview playback
- **Memory Usage**: <100MB additional memory with 10 video previews active
- **Bandwidth**: <5MB additional per page load (acceptable for modern connections)

### Adoption
- **Stash Config**: >60% of users enable video preview generation
- **Feature Usage**: >70% of users keep "Auto" preview quality setting

---

## Open Questions for Discussion

1. **Default Preview Quality**: Should we default to "Auto" (video preferred) or "Sprite" (current behavior)?
   - **Recommendation**: Auto (matches user expectations)

2. **Mobile Strategy**: Should mobile default to sprites to save bandwidth?
   - **Recommendation**: Yes, add toggle in settings

3. **Preload Strategy**: When should we start loading video previews?
   - **Recommendation**: Metadata on 50% visible, full video on 90% visible

4. **Settings Location**: Server Settings or User Settings?
   - **Recommendation**: User Settings (personal preference, not server-wide)

5. **Analytics**: Should we track which preview types users see/prefer?
   - **Recommendation**: Yes (privacy-preserving, opt-in)

---

## Files to Modify Summary

### stashapp-api (npm package)
- `src/operations/findScenes.graphql` - Add preview/webp fields
- `src/operations/findSceneById.graphql` - Add preview/webp fields
- Run codegen + publish

### peek-stash-browser/server
- `controllers/proxy.ts` - Add /preview and /webp routes
- `types/nested.ts` - Update ScenePaths interface (if needed)
- `prisma/schema.prisma` - Add user preview preferences (Phase 4)

### peek-stash-browser/client
- `components/ui/SceneCardPreview.jsx` - Implement preview fallback chain
- `components/video-player/VideoPreview.jsx` - New component (optional extraction)
- `pages/Settings.jsx` - Add preview quality settings (Phase 4)
- `services/api.js` - Add preview URL helpers if needed

### Documentation
- `README.md` - Update with preview quality information
- `docs/user-guide/` - Add preview settings documentation

---

## Recommended Approach

### Start with MVP (Phases 1-3)
**Rationale**:
- Validate that video previews provide better UX
- Identify performance bottlenecks early
- Get user feedback before investing in preferences/optimization

**Deliverable**:
- Video previews work on scene cards
- Automatic fallback to webp/sprite/screenshot
- No user settings yet (always prefer highest quality)

### Iterate Based on Feedback
- Monitor performance metrics
- Gather user feedback on bandwidth usage
- Add preferences if users request control

---

## Timeline Estimate

| Phase | Description | Time | Dependencies |
|-------|-------------|------|--------------|
| 1.1 | Update stashapp-api | 1-2 hours | None |
| 1.2 | Update Peek types | 30 min | 1.1 complete |
| 2.1 | Add proxy routes | 1 hour | 1.2 complete |
| 3.1 | Preview fallback logic | 2 hours | 2.1 complete |
| 3.2 | Video preview impl | 2-3 hours | 3.1 complete |
| 3.3 | WebP preview impl | 1 hour | 3.2 complete |
| **MVP Total** | **Phases 1-3** | **7-9 hours** | |
| 4.1 | User preferences | 2 hours | MVP complete |
| 4.2 | Lazy loading | 2-3 hours | MVP complete |
| 4.3 | Caching strategy | 1 hour | MVP complete |
| 5.1 | Graceful degradation | 1 hour | MVP complete |
| **Full Total** | **Phases 1-5** | **13-16 hours** | |

---

## Conclusion

Implementing video preview support will significantly improve Peek's user experience by providing smooth, high-quality previews that match modern streaming platform standards. The fallback chain ensures backwards compatibility, and the phased approach allows for iterative improvement based on real-world usage.

**Recommendation**: Start with MVP to validate benefits, then add user preferences and optimizations based on feedback.
