# Timeline View Design

A new view mode for browsing scenes, galleries, and images by date on a horizontally scrollable timeline.

## Overview

Timeline view adds a fourth view mode (alongside Grid, Wall, Table) for Scene, Gallery, and Image entities. It displays a horizontal timeline with density bars showing content distribution over time. Users select a time period to filter results shown below.

## Core Decisions

| Decision | Choice |
|----------|--------|
| Scope | New view mode per entity (scenes, galleries, images) |
| Items without dates | Excluded from timeline view entirely |
| Selection behavior | Matches zoom granularity (click year = select year) |
| Density visualization | Vertical bars with count on hover |
| Zoom control | Segmented toggle: Years \| Months \| Weeks \| Days |
| Empty time periods | Shown proportionally (gaps represent actual time) |
| Default on load | Most recent time period with content |
| Desktop layout | Fixed timeline header above scrollable results |
| Mobile layout | Compact timeline in draggable bottom sheet |
| Navigation | Full keyboard + TV remote support |

## Visual Design

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Years] [Months] [Weeks] [Days]                                    │
├─────────────────────────────────────────────────────────────────────┤
│    │      ││   │         │││        │    │                          │
│    │      ││   │         │││        │    │        ← density bars    │
│    │      ││   │         │││        │    │                          │
│  ──┴──────┴┴───┴─────────┴┴┴────────┴────┴──      ← baseline        │
│  2020    2021  2022      2023      2024  2025     ← labels          │
│                           ▲                                         │
│                      [selected]                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                               │
│   │     │  │     │  │     │  │     │                               │
│   │     │  │     │  │     │  │     │    ← results grid             │
│   └─────┘  └─────┘  └─────┘  └─────┘                               │
│                                                                     │
│   ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                               │
│   │     │  │     │  │     │  │     │                               │
│   └─────┘  └─────┘  └─────┘  └─────┘                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

Bottom sheet with three states:

**Minimized (default while browsing):** ~48px
```
┌─────────────────────────────────┐
│  ━━━  March 2024 · 47 scenes  ▲ │
└─────────────────────────────────┘
```

**Expanded:** ~200px with full timeline controls

**Gestures:**
- Swipe up on minimized bar to expand
- Swipe down on expanded sheet to minimize
- Tap period to select, auto-minimizes after selection

## Component Architecture

### New Files

```
client/src/components/timeline/
├── TimelineView.jsx          # Main container, layout management
├── TimelineStrip.jsx         # Horizontal scrollable timeline with bars
├── TimelineControls.jsx      # Zoom level toggle (Years/Months/Weeks/Days)
├── TimelineBar.jsx           # Individual density bar component
├── TimelineMobileSheet.jsx   # Bottom sheet wrapper for mobile
└── useTimelineState.js       # State hook (zoom, selection, distribution)

server/
├── services/TimelineService.ts        # Date distribution queries
└── controllers/timelineController.ts  # API endpoint
```

### Files to Modify

- `client/src/config/entityDisplayConfig.js` - Add 'timeline' to view modes
- `client/src/components/ui/ViewModeToggle.jsx` - Add timeline icon/option
- `client/src/components/scene-search/SceneSearch.jsx` - Render TimelineView
- `client/src/components/gallery-search/GallerySearch.jsx` - Same
- `client/src/components/image-search/ImageSearch.jsx` - Same
- `server/routes/api.ts` - Add distribution endpoint route

### Dependencies

- Bottom sheet package (e.g., `react-spring-bottom-sheet` or similar, styled to match app)

## State Management

### useTimelineState Hook

```javascript
{
  zoomLevel: 'months',        // 'years' | 'months' | 'weeks' | 'days'
  selectedPeriod: {           // null if nothing selected
    start: '2024-03-01',
    end: '2024-03-31',
    label: 'March 2024'
  },
  scrollPosition: 0.85,       // 0-1, percentage through timeline
  distribution: [             // fetched density data
    { period: '2024-01', count: 47, start: '...', end: '...' },
    { period: '2024-02', count: 12, start: '...', end: '...' },
  ]
}
```

### Filter Integration

Uses the permanent filter pattern from detail pages:

```javascript
// Permanent filter: exclude items without dates
permanentFilters={{
  date: {
    value: { modifier: 'NOT_NULL' },
  }
}}

// Selection filter: added when a period is selected
selectionFilter={{
  date: {
    value: selectedPeriod.start,
    value2: selectedPeriod.end,
    modifier: 'BETWEEN'
  }
}}
```

User-added filters (tags, performers, etc.) stack on top. Sorting affects results order but not the timeline.

## API Design

### New Endpoint

```
GET /api/{entityType}/date-distribution?granularity=months
```

Response:
```json
[
  { "period": "2024-01", "count": 47 },
  { "period": "2024-02", "count": 12 }
]
```

### Server Implementation

Follows existing `SceneQueryBuilder.ts` pattern with pre-computed exclusions:

```typescript
private buildDateDistributionQuery(userId: number, granularity: string) {
  return `
    SELECT
      strftime('${this.getStrftimeFormat(granularity)}', s.date) as period,
      COUNT(*) as count
    FROM StashScene s
    LEFT JOIN UserExcludedEntity e
      ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id
    WHERE s.deletedAt IS NULL
      AND e.id IS NULL           -- Exclude hidden/restricted
      AND s.date IS NOT NULL     -- Only items with dates
    GROUP BY period
    ORDER BY period ASC
  `;
}
```

**strftime formats:**
- years: `'%Y'` → `'2024'`
- months: `'%Y-%m'` → `'2024-03'`
- weeks: `'%Y-W%W'` → `'2024-W12'`
- days: `'%Y-%m-%d'` → `'2024-03-15'`

**Performance:** JOIN to `UserExcludedEntity` uses index `(userId, entityType)`, efficient at 100k+ items.

## Interaction Behavior

### Timeline Strip

- Horizontal scroll via drag, touch swipe, or shift+scroll wheel
- Mousewheel over timeline (without shift) changes zoom level
- Pinch gesture on touch devices changes zoom level
- Click bar to select that time period
- Selected period highlighted visually
- Hover shows tooltip with count ("47 scenes")
- Smooth animated transitions when changing zoom levels

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `←` / `→` | Move selection to previous/next period |
| `+` / `-` | Change zoom level |
| `Enter` | Confirm selection, focus results grid |
| `Tab` | Move focus: controls → timeline → results |
| `Home` / `End` | Jump to earliest/latest content |

### TV Remote

- D-pad left/right: navigate periods
- D-pad up/down: zoom out/in
- Select: confirm selection
- Back: return focus to timeline

### Screen Reader

- Announce: "Timeline, March 2024, 47 scenes, 3 of 24 periods"
- On navigation: "April 2024, 12 scenes"
- On selection: "Selected March 2024, showing 47 scenes"

## Open Questions

None at this time. Design is approved and ready for implementation planning.
