# Card Interaction Improvements Design

## Problem

Current card interactions rely heavily on hover behaviors that are:
1. **Mobile-unfriendly** - Hover doesn't exist on touch devices
2. **Accidentally triggered** - Mouse movement while browsing causes unwanted tooltip popups
3. **Not discoverable** - No visual indication that indicators are interactive

## Solution

Replace hover-based interactions with click/tap-only patterns across all cards.

## Changes

### 1. Indicator Tooltips → Click-Only Popovers

**Current behavior:**
- Hover shows rich tooltip (entity grid)
- Click also works (via `clickable` prop)
- Both behaviors active simultaneously

**New behavior:**
- Remove hover entirely
- Click/tap opens popover with entity grid
- Tap outside to dismiss
- No additional visual affordance (users discover by tapping)

**Implementation:**
- Modify `Tooltip` component to support a `hoverDisabled` prop (or rename `clickable` to be clearer)
- Update `CardCountIndicators` to disable hover for rich tooltips
- Keep simple text tooltips (e.g., "3 scenes") as-is since they're not intrusive

### 2. Description Tooltips → Inline "more" Link

**Current behavior:**
- Truncated description with hover tooltip showing full text

**New behavior:**
- Truncated description with inline "more" link at end of text
- "more" link only visible when text is actually truncated
- Clicking "more" opens popover with full description
- Tap outside to dismiss

**Implementation:**
- Modify `CardDescription` component:
  - Detect text truncation (compare scrollHeight vs clientHeight)
  - Render "...more" at end of truncated text
  - On click, show popover with full description
- Remove hover tooltip from descriptions

## Affected Components

| Component | Change |
|-----------|--------|
| `Tooltip.jsx` | Add `hoverDisabled` prop to skip hover handlers |
| `CardCountIndicators.jsx` | Pass `hoverDisabled` for rich tooltips |
| `CardDescription` (in `CardComponents.jsx`) | Replace tooltip with truncation detection + "more" link + popover |

## Cards Affected

All cards use `BaseCard` which uses `CardDescription` and `CardIndicators`:
- GalleryCard
- GroupCard
- ImageCard
- PerformerCard
- StudioCard
- TagCard
- SceneCard (if it uses BaseCard pattern)

## Out of Scope

- Title tooltips (only show for very long titles, less intrusive)
- Indicator navigation clicks (already work correctly)
- Any layout changes to cards

## Testing

1. Verify indicators no longer show tooltip on hover
2. Verify indicators show popover on click
3. Verify "more" link appears only when description is truncated
4. Verify "more" popover shows full description
5. Verify tap-outside dismisses popovers
6. Test on mobile/touch device
