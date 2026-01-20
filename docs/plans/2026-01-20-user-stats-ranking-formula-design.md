# User Stats Ranking Formula Design

## Problem Statement

The current "top" rankings on the user stats page use simple `playCount DESC` sorting, which produces misleading results:

1. **Male performers dominate** - They appear in 3-5x more scenes on average, so they accumulate more plays by sheer exposure
2. **Ubiquitous tags rank unfairly high** - "Blowjob" (41% of library) will always beat niche tags regardless of actual preference
3. **Large studios have inherent advantage** - More scenes = more opportunity for plays
4. **No quality signal** - A scene watched for 5 seconds counts the same as one watched fully with engagement

## Solution: Bayesian-Weighted Normalized Engagement Score

Combine three proven techniques:

1. **Weighted engagement metrics** - O-count matters most, then duration, then play count
2. **Library presence normalization** - Score relative to available content
3. **Bayesian dampening** - Prevent small sample sizes from dominating

### The Formula

For performers, tags, and studios:

```
rawEngagement = (oCount × 5) + (normalizedDuration × 1) + (playCount × 1)

engagementRate = rawEngagement / libraryPresence

finalScore = (plays / (plays + m)) × engagementRate + (m / (plays + m)) × globalAvgRate
```

For scenes (no library presence to normalize against):

```
finalScore = (oCount × 5) + (normalizedDuration × 1) + (playCount × 1)
```

### Variables Explained

| Variable | Description | Source |
|----------|-------------|--------|
| `oCount` | Number of Os recorded | `UserPerformerStats.oCounter`, `WatchHistory.oCount`, etc. |
| `normalizedDuration` | Watch time normalized by average scene length | `SUM(playDuration) / avgSceneDuration` |
| `playCount` | Number of times played | `UserPerformerStats.playCount`, etc. |
| `libraryPresence` | Scenes available in library | Count of scenes with this performer/tag/studio |
| `plays` | Total play events for this entity | Same as playCount |
| `m` | Bayesian dampening threshold | Tunable constant (recommend: 5) |
| `globalAvgRate` | Average engagement rate across all entities of this type | Computed per-user |

### Weight Rationale

| Metric | Weight | Reasoning |
|--------|--------|-----------|
| O-count | 5 | Strongest signal of genuine enjoyment |
| Duration | 1 | Time spent indicates interest, but longer scenes shouldn't dominate |
| Play count | 1 | Returning to content matters, but less than completion/enjoyment |

### Bayesian Dampening

The formula `(plays / (plays + m)) × score + (m / (plays + m)) × globalAvg` works as follows:

- With 0 plays: Score = 100% global average (no personal signal)
- With `m` plays: Score = 50% personal + 50% global average
- With `2m` plays: Score = 67% personal + 33% global average
- With `10m` plays: Score = 91% personal + 9% global average

This prevents a performer with 2 scenes (both watched with Os) from unfairly beating a performer with 100 scenes (40 watched, 10 with Os). The small-catalog performer needs more engagement to prove they're truly a favorite.

### Example Calculations

**Scenario**: Phoenix's top performers

| Performer | Gender | Library Scenes | Plays | Os | Duration (norm) | Raw Engagement | Engagement Rate | Bayesian Score |
|-----------|--------|----------------|-------|-----|-----------------|----------------|-----------------|----------------|
| Lexi Belle | F | 109 | 5 | 3 | 2.5 | 22.5 | 0.206 | 0.146 |
| Scott Nails | M | 208 | 8 | 2 | 4.0 | 22.0 | 0.106 | 0.088 |
| Evan Stone | M | 491 | 7 | 5 | 3.5 | 35.5 | 0.072 | 0.063 |

*Assuming m=5, globalAvgRate=0.05, avgSceneDuration=1200s*

With normalization + Bayesian dampening, Lexi Belle (female, smaller catalog, higher engagement rate) ranks above male performers with more raw plays.

## Implementation

### Database Changes

None required - all data already exists in:
- `WatchHistory` (scenes)
- `UserPerformerStats`, `UserStudioStats`, `UserTagStats` (aggregated stats)
- `StashScene`, `ScenePerformer`, `SceneTag` (library presence counts)

### Service Changes

Modify `UserStatsAggregationService.ts`:

1. Add helper to compute `globalAvgRate` per entity type
2. Add helper to compute `avgSceneDuration` for normalization
3. Update `getTopPerformers()`, `getTopStudios()`, `getTopTags()`, `getTopScenes()` to use new formula
4. Return the computed score in API response for transparency

### API Response Changes

Add `score` field to each top item so the UI can display it if desired:

```typescript
interface TopPerformer {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  playDuration: number;
  oCount: number;
  score: number;  // NEW: computed ranking score
}
```

### Configuration

Add tunable constants (could be environment variables or hardcoded initially):

```typescript
const RANKING_CONFIG = {
  weights: {
    oCount: 5,
    duration: 1,
    playCount: 1,
  },
  bayesianThreshold: 5,  // 'm' in the formula
};
```

## Testing Strategy

1. **Unit tests** for score calculation with known inputs
2. **Integration tests** comparing old vs new rankings
3. **Manual verification** with Phoenix user data - do rankings "feel right"?

## Future Enhancements

- User-configurable weights via settings
- Recency weighting (recent engagement matters more)
- Separate "trending" vs "all-time" rankings
- A/B testing different weight configurations

## Recommendations Page Integration (Pending Validation)

Once the user stats ranking formula is validated, these learnings can improve the Recommendations page (`RecommendationScoringService.ts`):

### Current Gaps in Recommendations

1. **No watch history data** - Only uses explicit ratings/favorites, ignores actual viewing behavior
2. **No library presence normalization** - Male performers / ubiquitous tags could dominate derived weights
3. **No small-sample dampening** - A single favorited scene gives its performers full weight

### Proposed Improvements

1. **Hybrid scoring** - Blend explicit preferences (current) with implicit engagement (this formula) for derived weights

2. **Engagement-weighted scene derivation** - Currently a favorited scene propagates weight to all its performers equally. Weight by actual engagement instead: a performer in a scene watched 5x with 3 Os gets more derived weight than one in a scene favorited but barely watched.

3. **Library presence normalization for derived weights** - When accumulating `derivedPerformerWeights`, divide by performer's library presence so niche performers with deep engagement rank higher.

**Status**: Pending validation of user stats formula. Test there first, then apply to recommendations.
