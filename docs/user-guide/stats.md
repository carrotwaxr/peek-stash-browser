# User Stats

Track your viewing engagement with detailed statistics, rankings, and highlights across your library.

**Location:** Navigation menu → **User Stats** (or set as your landing page in [Personalization](personalization.md))

## Overview

The stats page shows your personal engagement data organized into four sections:

- **Library totals** — Scene, performer, studio, tag, gallery, image, and clip counts
- **Engagement totals** — Cumulative watch time, play count, O count, and coverage
- **Top lists** — Your most-engaged performers, studios, tags, and scenes
- **Highlights** — Your single most-watched scene, most-viewed image, and top O'd scene/performer

## Engagement Totals

The hero section at the top displays your cumulative activity:

| Metric | What It Measures |
|--------|------------------|
| **Watch Time** | Total time spent watching scenes |
| **Play Count** | Number of play sessions (5+ minutes counts as one play) |
| **O Count** | Combined O counter increments across scenes and images |
| **Scenes Watched** | Unique scenes watched and percentage of library coverage |
| **Images Viewed** | Unique images viewed |

## Top Lists

Four ranked lists show your top 10 most-engaged entities:

- **Top Scenes** — By engagement score
- **Top Performers** — By engagement score
- **Top Studios** — By engagement score
- **Top Tags** — By engagement score

### Sorting Top Lists

Use the sort toggle to change how top lists are ranked:

| Sort | Shows |
|------|-------|
| **Engagement** (default) | Percentile rank (e.g., "Top 85%"), watch duration, play count, O count |
| **O Count** | Total O counter increments, watch duration, play count |
| **Play Count** | Total plays, watch duration, O count |

Changing the sort updates all four lists simultaneously.

### How Engagement Scores Work

Engagement scores combine multiple signals to reflect your actual preferences:

- **O count** is weighted most heavily — it's the strongest signal of preference
- **Watch duration** is normalized against average scene length
- **Play count** adds a straightforward popularity measure

Scores are then normalized by how many scenes feature each entity. A performer who appears in 5 scenes but has high engagement ranks higher than one in 500 scenes with moderate engagement. This prevents entities that simply appear frequently from dominating the rankings.

Percentile ranks show where each entity falls relative to all others — "Top 92%" means that entity is in your 92nd percentile of engagement.

## Highlights

Four highlight cards showcase your single best-of entries:

- **Most Watched Scene** — Highest play count
- **Most Viewed Image** — Highest view count
- **Most O'd Scene** — Highest O count
- **Most O'd Performer** — Highest O count across all their scenes

## Refreshing Stats

Rankings are automatically refreshed when they become stale (typically after an hour of activity). Click the **Refresh** button on the stats page to manually trigger a recalculation.

Stats update in real-time as you watch scenes and interact with content — rankings are the only component that recalculates periodically.

## Related

- [Watch History](watch-history.md) — How play tracking works
- [Recommendations](recommendations.md) — How engagement data powers recommendations
- [Personalization](personalization.md) — Set User Stats as your landing page
