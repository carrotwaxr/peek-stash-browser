# Recommendations Improvements Design

**Date:** 2025-12-16
**Branch:** `feature/recommendations-improvements`
**Related Issues:** #181, #172

## Problem Statement

Users report the Recommended page shows no content despite having favorited/rated scenes. The current algorithm only considers explicit Performer, Studio, and Tag ratings—not Scene ratings. Users naturally rate scenes first, leading to confusion when recommendations don't appear.

Additionally, error messages are unhelpful and logging doesn't capture enough detail to diagnose issues.

## Design Overview

Four improvements:

1. **Scene-based recommendations** - Derive entity preferences from rated/favorited scenes
2. **Inline user feedback** - Show users what's missing when recommendations are empty
3. **Better error handling** - Improved logging and user-facing error messages
4. **Unit tests** - Test coverage for recommendation scoring logic

---

## 1. Scene-Based Recommendations

### Concept

When a user favorites or rates a scene highly, we extract its entities (performers, studio, tags) and add them to the preference pool with diminished weights compared to explicit entity ratings.

### Weight Formula

```typescript
// Skip scenes rated below threshold
if (sceneRating < 40) continue;

// Favorited-only scenes get implicit rating
const effectiveRating = sceneRating ?? (isFavorited ? 85 : null);
if (effectiveRating === null) continue;

// Calculate weight multiplier
const BASE_WEIGHT = 0.4;
const FAVORITE_BONUS = 0.15;

let weightMultiplier = (effectiveRating / 100) * BASE_WEIGHT;
if (isFavorited) {
  weightMultiplier += FAVORITE_BONUS;
}
```

### Weight Examples

| Scenario | Multiplier | Performer pts | vs Explicit (5 pts) |
|----------|------------|---------------|---------------------|
| Scene rated 100 + favorited | 0.55 | 2.75 | 55% |
| Scene favorited only (→85) | 0.49 | 2.45 | 49% |
| Scene rated 100, not fav | 0.40 | 2.00 | 40% |
| Scene rated 80 + favorited | 0.47 | 2.35 | 47% |
| Scene rated 80, not fav | 0.32 | 1.60 | 32% |
| Scene rated 60, not fav | 0.24 | 1.20 | 24% |
| Scene rated 40, not fav | 0.16 | 0.80 | 16% |
| Scene rated 39 | - | 0 (skipped) | - |

### Implementation

In `getRecommendedScenes()`:

1. Fetch `sceneRatings` alongside existing performer/studio/tag ratings
2. Build derived preference maps from favorited/rated scenes:
   - `derivedPerformerWeights: Map<string, number>`
   - `derivedStudioWeights: Map<string, number>`
   - `derivedTagWeights: Map<string, number>`
3. When scoring, combine explicit preferences with derived weights
4. Apply same sqrt diminishing returns to derived weights

### Derived Weight Accumulation

When multiple scenes contribute to the same entity, weights accumulate but with diminishing returns:

```typescript
// For each scene's performer
const sceneWeight = calculateSceneWeight(scene);
const currentWeight = derivedPerformerWeights.get(performerId) || 0;
derivedPerformerWeights.set(performerId, currentWeight + sceneWeight);

// When scoring, apply sqrt to accumulated derived weights
const derivedPerformerScore = Math.sqrt(derivedPerformerWeight) * 5;
```

---

## 2. Inline User Feedback

### Empty State Message

When recommendations return empty, the API response includes diagnostic info:

```typescript
// Response structure
{
  scenes: [],
  count: 0,
  page: 1,
  perPage: 24,
  message: "No recommendations yet",
  criteria: {
    favoritedPerformers: 0,
    ratedPerformers: 0,
    favoritedStudios: 0,
    ratedStudios: 0,
    favoritedTags: 0,
    ratedTags: 0,
    favoritedScenes: 3,
    ratedScenes: 5
  }
}
```

### Client Display

The Recommended page shows:

> **No Recommendations Yet**
>
> To get personalized suggestions, try favoriting or rating (7.0+) performers, studios, tags, or scenes you enjoy.
>
> Your current activity:
> - 0 favorited performers, 0 highly-rated performers
> - 0 favorited studios, 0 highly-rated studios
> - 0 favorited tags, 0 highly-rated tags
> - 3 favorited scenes, 5 rated scenes
>
> *Tip: Rating more scenes helps us learn your preferences!*

If they have scene activity but no results, clarify:

> *We're analyzing your rated scenes to find recommendations...*

---

## 3. Better Error Handling

### Server-Side Logging

Update the catch block to capture full error details:

```typescript
catch (error) {
  const err = error as Error;
  logger.error("Error getting recommended scenes:", {
    message: err.message,
    name: err.name,
    stack: err.stack,
    userId,
  });

  const errorType = err.name || "Unknown error";
  res.status(500).json({
    error: "Failed to get recommended scenes",
    errorType
  });
}
```

### Client-Side Display

```jsx
{error && (
  <ErrorMessage>
    Unable to load recommendations. ({error.errorType || "Please try again later"})
  </ErrorMessage>
)}
```

---

## 4. Unit Tests

### Test File

Create `server/tests/recommendations/recommendationScoring.test.ts`

### Test Cases

**Explicit entity scoring:**
- Favorited performer adds 5 points
- Highly-rated performer (80+) adds 3 points
- Favorited studio adds 3 points
- Multiple performers use sqrt diminishing returns

**Scene-derived scoring:**
- Scene rated 100 derives 40% weight for entities
- Scene rated 100 + favorited derives 55% weight
- Scene favorited only uses implicit rating of 85
- Scene rated < 40 contributes nothing
- Multiple scenes for same performer accumulate with sqrt

**Edge cases:**
- User with no ratings/favorites returns empty with message
- User with only scene ratings (no explicit) still gets recommendations
- Scene with no performers/studio/tags contributes nothing
- Combination of explicit + derived preferences

**Weight calculation:**
- `calculateSceneWeight(100, true)` returns 0.55
- `calculateSceneWeight(85, false)` returns 0.34
- `calculateSceneWeight(39, false)` returns 0 (below floor)

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/controllers/library/scenes.ts` | Update `getRecommendedScenes()` with scene-derived scoring, criteria response, error handling |
| `client/src/components/pages/Recommended.jsx` | Display criteria counts in empty state, show error type |
| `server/tests/recommendations/recommendationScoring.test.ts` | New test file |

---

## Out of Scope

- Negative signals from low-rated scenes (future enhancement)
- Collaborative filtering ("users like you also liked")
- Watch time / percentage watched as signal
- Admin diagnostic endpoint (replaced by inline feedback)

---

## Testing Plan

1. Unit tests pass for scoring logic
2. Manual test: User with only scene favorites sees recommendations
3. Manual test: Empty state shows correct criteria counts
4. Manual test: Error state shows error type
5. Verify existing explicit-rating users still get correct recommendations
