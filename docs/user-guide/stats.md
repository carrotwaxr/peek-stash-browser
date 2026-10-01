# User Stats

Track your viewing engagement with detailed statistics, rankings, and highlights across your library.

**Location:** Navigation menu → **User Stats** (or set as your landing page in [Personalization](personalization.md))

## Overview

The stats page shows your personal engagement data organized into four sections:

- **Library totals** — Scene, performer, studio, tag, gallery, image, and clip counts
- **Engagement totals** — Cumulative watch time, play count, O count, and coverage
- **Top lists** — Your most-engaged performers, studios, tags, and scenes
- **Highlights** — Your single most-watched scene, most-viewed image, and top O'd scene/performer

## Library Totals

Each total is the number of items you can browse: the same number the matching page shows with no filter (the Clips total counts clips with a preview, as the Clips page does by default). Items you hid, content restricted for you, anything deleted from Stash and Stash servers you have not selected are left out, and the totals change as soon as you hide or unhide something.

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

Refresh (the circular arrow at the top of the page) recomputes your Top lists from your latest plays; it can take a few seconds. Without it, the lists are recomputed when they are an hour old.

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

Percentile ranks show where each entity falls relative to all others — "Top 92%" means that entity is in your 92nd percentile of engagement. The ranking compares an entity with everything you have engaged with on every Stash server in your scope, including servers you have deselected, although the lists only show what you can see.

## Highlights

Four highlight cards showcase your single best-of entries:

- **Most Watched Scene** — Highest play count
- **Most Viewed Image** — Highest view count. Click the card to open the image in the viewer right on the Stats page (only an image you can still see opens).
- **Most O'd Scene** — Highest O count
- **Most O'd Performer** — Highest O count across all their scenes

## Refreshing Stats

Performer, studio and tag rankings are recalculated at most once an hour. When you sign in, open this page or load Recommended and your rankings are more than an hour old, Peek recalculates them: this page waits for the new rankings, while signing in and Recommended carry on and use them next time. After you clear your watch history, or an admin imports your data with Sync from Stash, the next recalculation does not wait for the hour. Top Scenes are ranked from your watch history each time the page loads. The **Refresh** button reloads the page's numbers; it does not force a recalculation.

Stats update in real-time as you watch scenes and interact with content. The performer, studio and tag rankings are the only part that recalculates periodically.

Everything on this page counts only what you can see. Items you hid, content restricted for you, anything deleted from Stash and Stash servers you have not selected are left out of the library totals, engagement totals, top lists and highlights as soon as they change. When two Stash servers use the same ids, each entry shows and links to the one on its own server. Deleted scenes also no longer count toward how many scenes feature an entity or toward the average scene length.

## Related

- [Watch History](watch-history.md) — How play tracking works
- [Recommendations](recommendations.md) — How engagement data powers recommendations
- [Personalization](personalization.md) — Set User Stats as your landing page
