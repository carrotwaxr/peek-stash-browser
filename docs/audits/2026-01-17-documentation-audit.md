# Documentation Audit - 2026-01-17

Audit of the mkdocs documentation site for unused files and accuracy issues.

---

## Part 1: Unused Files (Not in mkdocs.yml Navigation)

The following files exist in `docs/` but are **not included** in the mkdocs navigation. They won't appear on the GitHub Pages site.

### Root Level
- `CHANGES_SINCE_3.1.1.md` - Changelog fragment, likely temporary

### audits/
- `2026-01-04-security-audit-unauthenticated-routes.md`
- `2026-01-04-frontend-api-usage-audit.md`

### design/
- `cache-scalability-brainstorm.md`
- `cache-scalability-plan.md`
- `json-blob-elimination-plan.md`
- `scalability-audit-500k-scenes.md`
- `sqlite-cache-schema.md`

### plans/ (97 files)
All files in `docs/plans/` are internal development documents not linked in navigation:
- `2024-12-23-3.0-polish-design.md`
- `2024-12-23-3.0-polish-plan.md`
- `2024-12-29-lightbox-enhancements-design.md`
- `2024-12-29-lightbox-enhancements-impl.md`
- `2024-12-30-view-tracking-request-cancellation-design.md`
- ... (92+ additional plan files)
- `MULTI_INSTANCE_STASH.md`
- `REELS_IMPLEMENTATION.md`

### releases/
- `3.1.0-testing-checklist.md`

### Recommendation
These are internal working documents (designs, plans, audits). Consider:
1. Moving them to a separate `docs-internal/` folder outside the mkdocs site
2. Or add a "Developer Notes" section linking to them if intended for public reference

---

## Part 2: Development Documentation Accuracy Issues

### sync-architecture.md

#### Missing: Full Sync on Schema Migration
**Issue**: Document doesn't mention that Full Sync is automatically triggered when database migrations are applied between versions.

**Current triggers listed** (line 21-28):
- Initial setup (first sync)
- Manual "Full Sync" button in UI
- Recovery from corrupted state

**Missing trigger**:
> Full Sync is automatically triggered on server startup when database schema migrations are detected (e.g., upgrading from one version to another).

**Code reference**:
- `server/services/SyncScheduler.ts:217-231` - `performStartupSync()` checks `wereMigrationsApplied()` and triggers `fullSync()`
- `server/initializers/database.ts:106-124` - Counts migrations before/after to detect new schema changes

**Suggested addition** to "Full Sync" section:
```markdown
**Triggered by:**
- Initial setup (first sync)
- Manual "Full Sync" button in UI
- Recovery from corrupted state
- **Database schema migrations on startup** (automatic when upgrading versions)
```

---

### technical-overview.md

#### Outdated: Service Files Section (lines 509-525)
**Issue**: The "Implementation Notes" section references services that **no longer exist** in the codebase.

**Documented services that don't exist:**
| Service | Status |
|---------|--------|
| `UserRestrictionService.ts` | Does not exist - functionality moved |
| `EmptyEntityFilterService.ts` | Does not exist - functionality moved |
| `FilteredEntityCacheService.ts` | Does not exist - functionality moved |
| `StashCacheManager.ts` | Does not exist - replaced by `StashEntityService.ts` |

**Actual services in `server/services/`:**
| Service | Purpose |
|---------|---------|
| `StashEntityService.ts` | Replaces StashCacheManager - database queries for Stash entities |
| `UserHiddenEntityService.ts` | CRUD for user hidden entities |
| `ExclusionComputationService.ts` | Pre-computes and maintains UserExcludedEntity table |
| `EntityExclusionHelper.ts` | Helper for exclusion logic |
| `SceneQueryBuilder.ts` | SQL-based scene queries with exclusion JOINs |
| `PerformerQueryBuilder.ts` | SQL-based performer queries |
| `StudioQueryBuilder.ts` | SQL-based studio queries |
| `TagQueryBuilder.ts` | SQL-based tag queries |
| `GroupQueryBuilder.ts` | SQL-based group queries |
| `GalleryQueryBuilder.ts` | SQL-based gallery queries |
| `ImageQueryBuilder.ts` | SQL-based image queries |
| `RecommendationScoringService.ts` | Recommendation algorithm |
| `UserStatsService.ts` | User statistics |
| `UserStatsAggregationService.ts` | User stats aggregation |

**The architecture has changed from:**
> In-memory filtering (load all → filter in JS → paginate)

**To:**
> SQL-based pre-computed exclusions (query with exclusion JOINs → return filtered results)

The "Proposed Architecture" section (lines 299-402) describing `UserExcludedEntity` is now **implemented**, not proposed.

#### Document Version Outdated
- Line 581: `*Document Version: 3.0*`
- Line 582: `*Last Updated: 2025-01-02*`

Should be updated to reflect current state.

---

### local-setup.md

#### Minor: No issues found
Document appears accurate for development setup.

---

### api-reference.md

#### Minor: Auto-generated, appears current
Last updated: 2026-01-04 (line 4)

---

### regression-testing.md

#### Minor: Version mismatch
- Line 755: `**Last Updated**: 2025-01-21 (Version 1.6.0)`
- Current version is 3.x

---

## Part 3: Getting Started Documentation Issues

### installation.md & configuration.md

#### Missing: Whisparr Port Conflict Warning
**Issue**: Peek defaults to port 6969, which is also Whisparr's default port. Users running both will have a conflict.

**Suggested addition** to Port Configuration section in `installation.md` (after line 275):

```markdown
!!! warning "Port Conflict with Whisparr"
    Peek's default port (6969) is the same as Whisparr's default port. If you're running Whisparr, you'll need to change Peek's port:

    ```bash
    # Use a different port (e.g., 6970)
    docker run -d \
      --name peek-stash-browser \
      -p 6970:80 \  # Changed from 6969:80
      ...
    ```

Sources: [Whisparr FAQ | Servarr Wiki](https://wiki.servarr.com/whisparr/faq)
```

Similar note should be added to:
- `configuration.md` - in the Docker Compose example
- `quick-start.md` - if port is mentioned
- `docker-basics.md` - in port mapping section

---

## Summary

| Category | Issue | Priority |
|----------|-------|----------|
| Unused files | 100+ files not in nav (mostly plans/) | Low - intentional internal docs |
| sync-architecture.md | Missing "Full Sync on migration" trigger | **High** - users should know this |
| technical-overview.md | 4 services referenced don't exist | **High** - misleading for contributors |
| technical-overview.md | "Proposed" architecture is now implemented | Medium |
| installation.md | Missing Whisparr port conflict warning | **High** - common user issue |
| configuration.md | Missing Whisparr port conflict warning | **High** |
| regression-testing.md | Outdated version number | Low |

---

## Part 4: User Guide Documentation Issues

### recommendations.md

#### Incorrect: Rating Threshold
**Issue**: Documentation states "7.0+" rating threshold, but code uses 80 (on 0-100 scale, equivalent to 8.0 on 10-point scale).

**Documentation** (lines 10, 12, 14):
> "Highly-rated performers - Scenes with performers you've rated 7.0+"

**Actual code** (`server/services/RecommendationScoringService.ts:283-287`):
```javascript
ratedPerformers: performerRatings.filter((r) => r.rating !== null && r.rating >= 80).length,
ratedStudios: studioRatings.filter((r) => r.rating !== null && r.rating >= 80).length,
ratedTags: tagRatings.filter((r) => r.rating !== null && r.rating >= 80).length,
```

**Fix**: Change "7.0+" to "80+" (or "4+ stars" if using 5-star display)

#### Accurate: Scoring Weights
The weight table (lines 93-101) is accurate:
- Favorited performer: weight = 5 (High) ✓
- Highly-rated performer: weight = 3 (Medium-High) ✓
- Favorited studio: weight = 3 (Medium) ✓
- Highly-rated studio: weight = 2 (Medium) ✓
- Favorited tags: weight = 1.0 (Low-Medium) ✓
- Highly-rated tags: weight = 0.5 (Low) ✓

---

### keyboard-navigation.md

#### Incorrect: Arrow Key Seek Duration
**Issue**: Documentation says arrow keys seek 10 seconds, but code does 5 seconds.

**Documentation** (lines 79-80):
> `←` | Seek backward 10 seconds
> `→` | Seek forward 10 seconds

**Actual code** (`client/src/hooks/useMediaKeys.js:94-101`):
- Arrow keys seek **5 seconds**, not 10

**Fix**: Change "10 seconds" to "5 seconds"

#### Not Implemented: Shift+Arrow Seeking
**Issue**: Documentation describes Shift+arrow for 5-second seeking, but this is not implemented.

**Documentation** (lines 82-83):
> `Shift+←` | Seek backward 5 seconds
> `Shift+→` | Seek forward 5 seconds

**Actual code**: No Shift+arrow handling found in `useMediaKeys.js`

**Fix**: Remove these rows or implement the feature

#### Missing: J/L Keys for 10-Second Jumps
**Issue**: J and L keys for 10-second seeking ARE implemented but NOT documented.

**Actual code** (`client/src/hooks/useMediaKeys.js:75-88`):
- `J` seeks backward 10 seconds
- `L` seeks forward 10 seconds

**Fix**: Add to documentation:
| `J` | Seek backward 10 seconds |
| `L` | Seek forward 10 seconds |

---

### images.md

#### Incomplete: Slideshow Timer Options
**Issue**: Documentation lists 4 options but code has 5.

**Documentation** (line 65):
> "Click the clock icon to adjust slideshow duration (3, 5, 10, or 15 seconds)."

**Actual code** (`client/src/components/ui/Lightbox.jsx:550-554`):
- 2 seconds (MISSING from docs)
- 3 seconds ✓
- 5 seconds ✓
- 10 seconds ✓
- 15 seconds ✓

**Fix**: Change to "(2, 3, 5, 10, or 15 seconds)"

#### Misleading: Rating Hotkeys in Lightbox
**Issue**: Documentation implies direct number key rating, but it requires pressing `R` first.

**Documentation** (lines 71-73):
> "Number keys 1-5: Set star rating (1-5 stars)"
> "0: Clear rating"
> "F key: Toggle favorite"

**Actual code** (`client/src/components/ui/Lightbox.jsx:373-378`):
- Must press `R` first to enter rating mode
- Then press `0-5` to set rating (maps to 0%, 20%, 40%, 60%, 80%, 100%)

**Fix**: Update to:
```markdown
- **R key**: Enter rating mode, then:
  - **1-5**: Set rating (1=20%, 2=40%, 3=60%, 4=80%, 5=100%)
  - **0**: Clear rating
```

#### Accurate: View Tracking
- "View count: Incremented after viewing for 3+ seconds" ✓
- Code confirms 3-second threshold (`Lightbox.jsx:341-371`)

---

### watch-history.md

#### Minor: Seek Duration Inconsistency
**Issue**: Documentation says arrows seek 10 seconds, but actual is 5 seconds (same issue as keyboard-navigation.md).

**Documentation** (lines 215-216):
> `←` | Seek backward 10s
> `→` | Seek forward 10s

**Fix**: Change to "5s" to match actual implementation

---

### custom-carousels.md

#### Accurate: All Limits
- "Maximum of **15 custom carousels** per user" ✓ (Code: `MAX_CAROUSELS_PER_USER = 15`)
- "Each carousel displays up to **12 scenes**" ✓ (Code: `CAROUSEL_SCENE_LIMIT = 12`)

---

### playlists.md

#### Accurate: No Issues Found
Documentation appears accurate for playlist features.

---

### hidden-items.md

#### Accurate: No Issues Found
Documentation appears accurate for hidden items features.

---

### external-player.md

#### Accurate: No Issues Found
Documentation appears accurate for external player features.

---

## Summary - All Issues

| Category | Document | Issue | Priority |
|----------|----------|-------|----------|
| Development | sync-architecture.md | Missing "Full Sync on migration" trigger | **High** |
| Development | technical-overview.md | 4 services referenced don't exist | **High** |
| Development | technical-overview.md | "Proposed" architecture is now implemented | Medium |
| Development | regression-testing.md | Outdated version number (1.6.0 vs 3.x) | Low |
| Getting Started | installation.md | Missing Whisparr port conflict warning | **High** |
| Getting Started | configuration.md | Missing Whisparr port conflict warning | **High** |
| User Guide | recommendations.md | Rating threshold wrong (7.0+ vs 80/100) | **High** |
| User Guide | keyboard-navigation.md | Arrow keys seek 5s, not 10s | **High** |
| User Guide | keyboard-navigation.md | Shift+arrow seeking not implemented | Medium |
| User Guide | keyboard-navigation.md | J/L keys (10s seek) not documented | Medium |
| User Guide | images.md | Slideshow 2s option not documented | Low |
| User Guide | images.md | Rating requires R prefix (not documented) | **High** |
| User Guide | watch-history.md | Seek duration inconsistency (same as above) | Medium |
| Unused Files | docs/ | 100+ internal files not in nav | Low |

---

## Fixes Applied (2026-01-17)

### Completed
- [x] Deleted 9 unused files (audits/, design/, releases/, CHANGES_SINCE_3.1.1.md)
- [x] sync-architecture.md - Added migration trigger to Full Sync section
- [x] installation.md - Added Whisparr port conflict warning
- [x] configuration.md - Added Whisparr port conflict warning
- [x] recommendations.md - Fixed rating threshold (7.0+ → 4+ stars)
- [x] keyboard-navigation.md - Fixed arrow keys (10s → 5s), added J/L keys, removed Shift+arrow
- [x] images.md - Fixed rating hotkeys (R prefix), added 2s slideshow option
- [x] watch-history.md - Fixed seek duration, added J/L keys

### Also Completed
- [x] technical-overview.md - Rewrote service architecture section with current services and query builders
- [x] regression-testing.md - Updated version number (1.6.0 → 3.2)

### Reference Section Fixes (2026-01-17)
- [x] faq.md - Added "How does Peek sync with Stash?" section for general users
- [x] faq.md - Added "What about TV Mode?" section with work-in-progress warning
- [x] keyboard-navigation.md - Added TV Mode work-in-progress warning at top
- [x] keyboard-navigation.md - Rewrote TV Mode section with current limitations
