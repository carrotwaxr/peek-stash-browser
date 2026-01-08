# SceneCard Navigation Issue - Current State

## Problem Summary

After refactoring card navigation to use explicit navigation zones (image/title as Links, rest of card as plain div), SceneCard is broken because it uses a fundamentally different pattern than other cards.

## The Two Patterns

### Pattern A: Other Cards (Gallery, Group, Performer, Studio, Tag, Image)
- Pass `linkTo` prop to BaseCard
- BaseCard passes `linkTo` to CardImage and CardTitle
- CardImage/CardTitle render as `<Link>` elements when `linkTo` is provided
- No custom click handling needed - React Router handles navigation

### Pattern B: SceneCard
- Does NOT pass `linkTo` to BaseCard
- Passes `onClick={handleClick}` instead
- Has extensive custom click handling:
  - Selection mode (checkbox multi-select)
  - Long press detection (for entering selection mode)
  - Touch gesture handling
  - Keyboard navigation (Enter/Space)
  - Checks for interactive elements before navigating
- Navigation happens via `navigate()` call inside `handleClick`

## Current Code State

### CardContainer (CardComponents.jsx:23-57)
Now a plain `<div>` that receives `onClick` prop:
```jsx
export const CardContainer = forwardRef(({ onClick, ...others }, ref) => {
  return (
    <div onClick={onClick} {...others}>
      {children}
    </div>
  );
});
```

### CardImage (CardComponents.jsx:89-211)
Conditionally renders as Link OR div:
```jsx
if (linkTo) {
  return <Link to={linkTo} ...>{imageContent}{children}</Link>;
}
return <div onClick={onClick} ...>{imageContent}{children}</div>;
```

**Problem:** BaseCard doesn't pass `onClick` to CardImage, only `linkTo`. So for SceneCard (no linkTo), the div has no onClick handler.

### CardTitle (CardComponents.jsx:296-382)
Conditionally wraps in Link:
```jsx
const titleContent = linkTo ? (
  <Link to={linkTo} ...>{titleElement}</Link>
) : (
  titleElement
);
```

**Problem:** Same issue - no linkTo means no Link wrapper, and no onClick passed.

### BaseCard (BaseCard.jsx:65-117)
Passes to CardImage and CardTitle:
```jsx
<CardImage
  linkTo={linkTo}
  referrerUrl={referrerUrl}
  // Note: onClick is NOT passed to CardImage
>
<CardTitle
  linkTo={linkTo}
  referrerUrl={referrerUrl}
  // Note: onClick is NOT passed to CardTitle
>
```

### SceneCard (SceneCard.jsx:383-425)
Passes to BaseCard:
```jsx
<BaseCard
  // Note: NO linkTo prop
  onClick={handleClick}
  onMouseDown={handleMouseDown}
  onMouseUp={handleMouseUp}
  // ... other gesture handlers
>
```

## Why Clicks Don't Work on SceneCard

1. User clicks on scene image/title area
2. Click event fires on CardImage's inner `<div>` (no onClick handler)
3. Event bubbles up to CardContainer's `<div>`
4. CardContainer has `onClick={handleClick}` from SceneCard
5. **BUT** SceneCardPreview renders children inside CardImage with `pointer-events-none`
6. The preview overlays, gradient, and progress bar all have `pointer-events-none`
7. So clicks SHOULD bubble through to CardContainer...

Wait - if pointer-events-none is set, clicks should bubble. Let me verify what's actually blocking.

## SceneCardPreview Pointer Events (SceneCardPreview.jsx)

All overlay elements have `pointer-events-none`:
- Line 356: `<img className="... pointer-events-none" />` (screenshot)
- Line 366: `<video className="... pointer-events-none" />` (mp4 preview)
- Line 382: `<img className="... pointer-events-none" />` (webp preview)
- Line 393-397: sprite container and img both have `pointer-events-none`
- Line 415, 424: duration and resolution badges have `pointer-events-none`

## Actual Issue to Investigate

The click handler on CardContainer should receive bubbled clicks from anywhere inside the card (since overlays are pointer-events-none). Need to verify:

1. Is something else capturing clicks?
2. Is the hover detection for SceneCardPreview (`onMouseEnter`/`onMouseLeave` on line 348-349) interfering?
3. Are the gesture handlers (onMouseDown, onTouchStart, etc.) causing issues?

## Files Involved

- `client/src/components/ui/CardComponents.jsx` - CardContainer, CardImage, CardTitle
- `client/src/components/ui/BaseCard.jsx` - Assembles card components
- `client/src/components/ui/SceneCard.jsx` - Scene-specific card with custom handlers
- `client/src/components/ui/SceneCardPreview.jsx` - Preview functionality

## Next Steps

After compaction, investigate:
1. Whether clicks are actually reaching CardContainer's onClick
2. If SceneCard needs to be refactored to use the same pattern as other cards
3. How to preserve SceneCard's unique features (selection mode, long press, gestures) while aligning with the new navigation architecture
