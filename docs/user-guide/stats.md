# User Stats

Track your viewing engagement with detailed statistics, rankings, and highlights across your library.

**Location:** Your user menu (your name, top right) → **My Stats**. You can also make it your landing page in [Personalization](personalization.md)

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
| **Play Count** | Number of plays. A watch counts as one play once you have watched the Minimum Play Percent of the scene (20% by default; change it in Settings → User Preferences → Playback) |
| **O Count** | Combined O counter increments across scenes and images |
| **Scenes Watched** | Unique scenes you played or had an O on, and the percentage of your library they cover. A scene you only opened does not count. |
| **Images Viewed** | Unique images viewed |

## Top Lists

Ranked lists show your top 10 most-engaged entities:

- **Top Scenes** — By engagement score
- **Top Performers** — By engagement score
- **Top Partners** — By engagement score. It appears when you choose partners under Settings > Customization > Recommendations (see [Recommendation settings](recommendations.md#recommendation-settings)).
- **Top Studios** — By engagement score
- **Top Tags** — By engagement score. Tags you ignore in the same settings are left out.

With **Partners who matter** set, partners get their own list and Top Performers lists everyone else: the performers you follow, performers of other genders and performers with no gender, as Recommended counts them.

Refresh (the circular arrow at the top of the page) recomputes your Top lists from your latest plays; it can take a few seconds. Without it, the lists are recomputed when they are an hour old.

### Sorting Top Lists

Use the sort toggle to change how top lists are ranked:

| Sort | Shows |
|------|-------|
| **Engagement** (default) | Percentile rank (e.g., "Top 85%"), watch duration, play count, O count |
| **O Count** | Total O counter increments, watch duration, play count |
| **Play Count** | Total plays, watch duration, O count |

Changing the sort updates every top list at once.

### How Engagement Scores Work

Each top list ranks by one engagement score:

**O count × 5, plus time watched (in average scene lengths), plus plays.**

- **O count** counts the most. It is the strongest sign of what you like.
- **Time watched** is measured against the average scene length in your library, so a long watch counts for more than a short one.
- **Plays** add one each.

The score uses all of your history. A performer, studio or tag scores from every scene of theirs that you played, watched or had an O on.

**Top 5%** means the entry is in the top 5% of everything you have engaged with of that kind: a performer in the top 5% of the performers you have engaged with. The ranking compares an entry with everything you have engaged with on every Stash server in your scope, including servers you have deselected, although the lists only show what you can see.

The rankings refresh at most once an hour (see [Refreshing Stats](#refreshing-stats)). The same viewing also feeds [Recommended](recommendations.md#how-it-works), which weighs recent viewing more than old viewing. These lists do not: they rank by your whole history.

## Highlights

Four highlight cards showcase your single best-of entries:

- **Most Watched Scene** — Highest play count
- **Most Viewed Image** — Highest view count. Click the card to open the image in the viewer right on the Stats page (only an image you can still see opens).
- **Most O'd Scene** — Highest O count
- **Most O'd Performer** — Highest O count across all their scenes. With **Performers I follow** set, only performers you follow count (and performers with no gender).

## Refreshing Stats

Performer, studio and tag rankings are recalculated at most once an hour. When you sign in, open this page or load Recommended and your rankings are more than an hour old, Peek recalculates them: this page waits for the new rankings, while signing in and Recommended carry on and use them next time. After you clear your watch history, or an admin imports your data with Sync from Stash, the next recalculation does not wait for the hour. Top Scenes are ranked from your watch history each time the page loads. The **Refresh** button recalculates your rankings now instead of waiting for the hour, then reloads the page's numbers. It recalculates at most once a minute for you, so a second press within the minute just reloads.

Stats update in real-time as you watch scenes and interact with content. The performer, studio and tag rankings are the only part that recalculates periodically.

Everything on this page counts only what you can see. Items you hid, content restricted for you, anything deleted from Stash and Stash servers you have not selected are left out of the library totals, engagement totals, top lists and highlights as soon as they change. When two Stash servers use the same ids, each entry shows and links to the one on its own server. Deleted scenes also no longer count toward how many scenes feature an entity or toward the average scene length.

## Related

- [Watch History](watch-history.md) — How play tracking works
- [Recommendations](recommendations.md) — How engagement data powers recommendations
- [Personalization](personalization.md) — Set User Stats as your landing page
