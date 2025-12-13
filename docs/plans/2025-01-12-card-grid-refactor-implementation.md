# Card & Grid Component Refactor Implementation Plan

> **Status: COMPLETED** - All 25 tasks implemented successfully on 2025-01-12.

## Implementation Summary

The card and grid refactor has been fully implemented with the following results:

### New Architecture
- **Card Layer 1 (Primitives):** `CardComponents.jsx` - CardImage, CardTitle, CardOverlay, etc.
- **Card Layer 2:** `BaseCard.jsx` - Composable card with render slots
- **Card Layer 3:** Entity cards in `components/cards/` - PerformerCard, GalleryCard, GroupCard, StudioCard, TagCard, ImageCard
- **Grid Layer 1:** `BaseGrid.jsx` - Layout, pagination, loading/empty states
- **Grid Layer 2:** `SearchableGrid.jsx` - Integrated search controls and data fetching
- **Grid Layer 3:** Entity grids in `components/grids/` - PerformerGrid, GalleryGrid, GroupGrid, StudioGrid, TagGrid, ImageGrid

### Files Deleted
- `GridCard.jsx` - Replaced by BaseCard + entity cards
- `EntityGrid.jsx` - Replaced by SearchableGrid + entity grids

### Additional Migrations
During implementation, 4 main search pages (Galleries, Groups, Studios, Tags) were discovered to still use the deprecated GridCard. These were migrated to use the new shared entity cards.

### Test Results
- All 346 tests pass
- No lint errors (only pre-existing warnings in unrelated files)

---

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the card and grid system to reduce duplication, improve consistency, and enable full-featured nested grids with locked filters.

**Architecture:** Three-layer card system (Primitives → BaseCard → Entity Cards) + Two-layer grid system (BaseGrid → SearchableGrid → Entity Grids). This eliminates the current duplication between SceneCard, PerformerCard, GridCard, and EntityGrid while preserving SceneCard's full feature set.

**Tech Stack:** React 18, React Router 6, Tailwind CSS, CSS variables for theming, Lucide React icons

---

## Phase 1: Card Primitives Cleanup

### Task 1: Add CardOverlay to CardComponents.jsx

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx:155-171` (after CardDefaultImage)
- Modify: `client/src/components/ui/index.js:9-19` (add export)

**Step 1: Write the failing test**

Create test file first:

```javascript
// client/src/components/ui/__tests__/CardComponents.test.jsx
import { render, screen } from "@testing-library/react";
import { CardOverlay } from "../CardComponents";

describe("CardOverlay", () => {
  it("renders children in positioned overlay", () => {
    render(
      <CardOverlay position="bottom-left">
        <span>Test Content</span>
      </CardOverlay>
    );
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("applies correct position classes for bottom-left", () => {
    const { container } = render(
      <CardOverlay position="bottom-left">
        <span>Content</span>
      </CardOverlay>
    );
    expect(container.firstChild).toHaveClass("absolute", "bottom-0", "left-0");
  });

  it("applies correct position classes for top-left", () => {
    const { container } = render(
      <CardOverlay position="top-left">
        <span>Content</span>
      </CardOverlay>
    );
    expect(container.firstChild).toHaveClass("absolute", "top-0", "left-0");
  });

  it("applies correct position classes for bottom-right", () => {
    const { container } = render(
      <CardOverlay position="bottom-right">
        <span>Content</span>
      </CardOverlay>
    );
    expect(container.firstChild).toHaveClass("absolute", "bottom-0", "right-0");
  });

  it("applies correct position classes for full", () => {
    const { container } = render(
      <CardOverlay position="full">
        <span>Content</span>
      </CardOverlay>
    );
    expect(container.firstChild).toHaveClass("absolute", "inset-0");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="CardComponents.test" --watchAll=false`
Expected: FAIL with "Cannot find module '../CardComponents'" or similar

**Step 3: Write CardOverlay implementation**

Add to `client/src/components/ui/CardComponents.jsx` after line 171 (after CardDefaultImage):

```javascript
/**
 * CardOverlay - Positioned overlay container for progress bars, selection checkboxes, etc.
 * @param {Object} props
 * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'full'} props.position - Position of overlay
 * @param {React.ReactNode} props.children - Content to render in overlay
 * @param {string} [props.className] - Additional CSS classes
 */
export const CardOverlay = ({ position = "bottom-left", children, className = "" }) => {
  const positionClasses = {
    "top-left": "absolute top-0 left-0",
    "top-right": "absolute top-0 right-0",
    "bottom-left": "absolute bottom-0 left-0",
    "bottom-right": "absolute bottom-0 right-0",
    "full": "absolute inset-0",
  };

  return (
    <div className={`${positionClasses[position]} ${className}`}>
      {children}
    </div>
  );
};
```

**Step 4: Update barrel export**

In `client/src/components/ui/index.js`, update the CardComponents export:

```javascript
export {
  CardContainer,
  CardDefaultImage,
  CardDescription,
  CardImage,
  CardIndicators,
  CardOverlay,  // Add this
  CardRatingRow,
  CardTitle,
  LazyImage,
  useLazyLoad,
} from "./CardComponents.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="CardComponents.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/ui/CardComponents.jsx client/src/components/ui/index.js client/src/components/ui/__tests__/CardComponents.test.jsx
git commit -m "feat(cards): add CardOverlay primitive for positioned overlays"
```

---

### Task 2: Fold LazyImage into CardImage

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx:76-148` (CardImage and LazyImage sections)

**Step 1: Write the failing test**

Add to `client/src/components/ui/__tests__/CardComponents.test.jsx`:

```javascript
import { CardImage } from "../CardComponents";

describe("CardImage", () => {
  it("renders image with lazy loading when src provided", () => {
    render(
      <CardImage src="/test.jpg" alt="Test" aspectRatio="16/9" />
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "/test.jpg");
  });

  it("renders placeholder when no src provided", () => {
    const { container } = render(
      <CardImage aspectRatio="16/9" entityType="scene" />
    );
    // Should render default icon, not an img tag
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies aspect ratio style", () => {
    const { container } = render(
      <CardImage src="/test.jpg" alt="Test" aspectRatio="2/3" />
    );
    expect(container.firstChild).toHaveStyle({ aspectRatio: "2/3" });
  });

  it("renders children overlay when provided", () => {
    render(
      <CardImage src="/test.jpg" alt="Test" aspectRatio="16/9">
        <span>Overlay Content</span>
      </CardImage>
    );
    expect(screen.getByText("Overlay Content")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="CardComponents.test" --watchAll=false`
Expected: FAIL (CardImage doesn't accept src prop yet)

**Step 3: Refactor CardImage to include lazy loading**

Replace CardImage in `client/src/components/ui/CardComponents.jsx`:

```javascript
/**
 * CardImage - Image container with aspect ratio and built-in lazy loading
 * @param {Object} props
 * @param {string} [props.src] - Image source URL
 * @param {string} [props.alt] - Alt text for image
 * @param {string} [props.aspectRatio] - CSS aspect ratio (e.g., "16/9", "2/3")
 * @param {string} [props.entityType] - Entity type for placeholder icon
 * @param {React.ReactNode} [props.children] - Overlay content
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Additional inline styles
 * @param {Function} [props.onClick] - Click handler
 */
export const CardImage = ({
  src,
  alt = "",
  aspectRatio = "16/9",
  entityType,
  children,
  className = "",
  style = {},
  onClick,
}) => {
  const [ref, isVisible] = useLazyLoad();
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const showPlaceholder = !src || hasError;

  const getPlaceholderIcon = () => {
    const icons = {
      performer: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      ),
      scene: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z" clipRule="evenodd" />
        </svg>
      ),
      gallery: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      ),
      default: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      ),
    };
    return icons[entityType] || icons.default;
  };

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      style={{
        aspectRatio,
        backgroundColor: "var(--bg-secondary)",
        ...style,
      }}
      onClick={onClick}
    >
      {showPlaceholder ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: "var(--text-muted)" }}
        >
          {getPlaceholderIcon()}
        </div>
      ) : (
        <>
          {/* Placeholder shown while loading */}
          {!isLoaded && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
          )}
          {/* Actual image - only render when visible for lazy loading */}
          {isVisible && (
            <img
              src={src}
              alt={alt}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
            />
          )}
        </>
      )}
      {/* Children rendered as overlay */}
      {children}
    </div>
  );
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="CardComponents.test" --watchAll=false`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/ui/CardComponents.jsx client/src/components/ui/__tests__/CardComponents.test.jsx
git commit -m "refactor(cards): fold LazyImage into CardImage with built-in lazy loading"
```

---

## Phase 2: BaseCard Implementation

### Task 3: Create BaseCard Component

**Files:**
- Create: `client/src/components/ui/BaseCard.jsx`
- Create: `client/src/components/ui/__tests__/BaseCard.test.jsx`
- Modify: `client/src/components/ui/index.js` (add export)

**Step 1: Write the failing test**

```javascript
// client/src/components/ui/__tests__/BaseCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { BaseCard } from "../BaseCard";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("BaseCard", () => {
  const defaultProps = {
    entityType: "scene",
    imagePath: "/test.jpg",
    title: "Test Title",
  };

  it("renders title", () => {
    renderWithRouter(<BaseCard {...defaultProps} />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    renderWithRouter(<BaseCard {...defaultProps} subtitle="Test Subtitle" />);
    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
  });

  it("hides subtitle when hideSubtitle is true", () => {
    renderWithRouter(
      <BaseCard {...defaultProps} subtitle="Test Subtitle" hideSubtitle />
    );
    expect(screen.queryByText("Test Subtitle")).not.toBeInTheDocument();
  });

  it("renders description when provided", () => {
    renderWithRouter(<BaseCard {...defaultProps} description="Test Description" />);
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("hides description when hideDescription is true", () => {
    renderWithRouter(
      <BaseCard {...defaultProps} description="Test Description" hideDescription />
    );
    expect(screen.queryByText("Test Description")).not.toBeInTheDocument();
  });

  it("renders as link when linkTo provided", () => {
    renderWithRouter(<BaseCard {...defaultProps} linkTo="/test" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/test");
  });

  it("renders indicators when provided", () => {
    renderWithRouter(
      <BaseCard
        {...defaultProps}
        indicators={[{ type: "SCENES", count: 5 }]}
      />
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls renderOverlay slot when provided", () => {
    renderWithRouter(
      <BaseCard
        {...defaultProps}
        renderOverlay={() => <span>Custom Overlay</span>}
      />
    );
    expect(screen.getByText("Custom Overlay")).toBeInTheDocument();
  });

  it("calls renderAfterTitle slot when provided", () => {
    renderWithRouter(
      <BaseCard
        {...defaultProps}
        renderAfterTitle={() => <span>After Title</span>}
      />
    );
    expect(screen.getByText("After Title")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="BaseCard.test" --watchAll=false`
Expected: FAIL with module not found

**Step 3: Write BaseCard implementation**

```javascript
// client/src/components/ui/BaseCard.jsx
import { forwardRef } from "react";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio.js";
import {
  CardContainer,
  CardDescription,
  CardImage,
  CardIndicators,
  CardRatingRow,
  CardTitle,
} from "./CardComponents.jsx";

/**
 * BaseCard - Composable card component that assembles primitives
 * Provides render slots for entity-specific customization
 */
export const BaseCard = forwardRef(
  (
    {
      // Data
      entityType,
      imagePath,
      title,
      subtitle,
      description,
      linkTo,

      // Indicators & Rating
      indicators = [],
      ratingControlsProps,

      // Display options
      hideDescription = false,
      hideSubtitle = false,
      maxTitleLines = 2,
      maxDescriptionLines = 3,

      // Customization slots
      renderOverlay,
      renderImageContent,
      renderAfterTitle,

      // Events & behavior
      onClick,
      onLongPress,
      className = "",
      referrerUrl,
      tabIndex,
      style,
      ...rest
    },
    ref
  ) => {
    const aspectRatio = useEntityImageAspectRatio(entityType);

    return (
      <CardContainer
        ref={ref}
        entityType={entityType}
        linkTo={linkTo}
        onClick={onClick}
        referrerUrl={referrerUrl}
        className={className}
        tabIndex={tabIndex}
        style={style}
        {...rest}
      >
        {/* Image Section */}
        <CardImage
          src={imagePath}
          alt={typeof title === "string" ? title : ""}
          aspectRatio={aspectRatio}
          entityType={entityType}
        >
          {/* Custom image content (e.g., sprite preview) */}
          {renderImageContent?.()}
          {/* Custom overlay (e.g., progress bar, selection checkbox) */}
          {renderOverlay?.()}
        </CardImage>

        {/* Title Section */}
        <CardTitle
          title={title}
          subtitle={hideSubtitle ? null : subtitle}
          maxTitleLines={maxTitleLines}
        />

        {/* After Title Slot (e.g., gender icon) */}
        {renderAfterTitle?.()}

        {/* Description */}
        {!hideDescription && description && (
          <CardDescription
            description={description}
            maxLines={maxDescriptionLines}
          />
        )}

        {/* Indicators */}
        {indicators.length > 0 && <CardIndicators indicators={indicators} />}

        {/* Rating Controls */}
        {ratingControlsProps && (
          <CardRatingRow entityType={entityType} {...ratingControlsProps} />
        )}
      </CardContainer>
    );
  }
);

BaseCard.displayName = "BaseCard";

export default BaseCard;
```

**Step 4: Add export to index.js**

Add to `client/src/components/ui/index.js`:

```javascript
export { BaseCard } from "./BaseCard.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="BaseCard.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/ui/BaseCard.jsx client/src/components/ui/__tests__/BaseCard.test.jsx client/src/components/ui/index.js
git commit -m "feat(cards): add BaseCard component with render slots"
```

---

## Phase 3: Entity Cards Directory Structure

### Task 4: Create cards directory and move PerformerCard

**Files:**
- Create: `client/src/components/cards/`
- Move: `client/src/components/ui/PerformerCard.jsx` → `client/src/components/cards/PerformerCard.jsx`
- Create: `client/src/components/cards/index.js`
- Modify: `client/src/components/ui/index.js` (re-export from new location)

**Step 1: Create directory and index file**

```javascript
// client/src/components/cards/index.js
export { default as PerformerCard } from "./PerformerCard.jsx";
```

**Step 2: Move PerformerCard**

Move file from `client/src/components/ui/PerformerCard.jsx` to `client/src/components/cards/PerformerCard.jsx`

Update imports in the moved file:

```javascript
// client/src/components/cards/PerformerCard.jsx
import { forwardRef } from "react";
import { GenderIcon, GridCard } from "../ui/index.js";
// ... rest of imports unchanged
```

**Step 3: Update ui/index.js to re-export**

Replace the PerformerCard export in `client/src/components/ui/index.js`:

```javascript
// Replace:
// export { default as PerformerCard } from "./PerformerCard.jsx";
// With:
export { PerformerCard } from "../cards/index.js";
```

**Step 4: Run existing app to verify no breaking changes**

Run: `cd client && npm run build`
Expected: SUCCESS with no errors

**Step 5: Commit**

```bash
git add client/src/components/cards/ client/src/components/ui/index.js
git rm client/src/components/ui/PerformerCard.jsx
git commit -m "refactor(cards): move PerformerCard to components/cards/"
```

---

### Task 5: Migrate PerformerCard to use BaseCard

**Files:**
- Modify: `client/src/components/cards/PerformerCard.jsx`

**Step 1: Write the failing test**

```javascript
// client/src/components/cards/__tests__/PerformerCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { PerformerCard } from "../index";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("PerformerCard", () => {
  const mockPerformer = {
    id: "1",
    name: "Test Performer",
    gender: "FEMALE",
    image_path: "/test.jpg",
    scene_count: 10,
    o_counter: 5,
    rating100: 80,
    favorite: true,
  };

  it("renders performer name", () => {
    renderWithRouter(<PerformerCard performer={mockPerformer} />);
    expect(screen.getByText("Test Performer")).toBeInTheDocument();
  });

  it("renders gender icon", () => {
    renderWithRouter(<PerformerCard performer={mockPerformer} />);
    // GenderIcon should be present
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("links to performer detail page", () => {
    renderWithRouter(<PerformerCard performer={mockPerformer} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/performer/1");
  });

  it("renders scene count indicator", () => {
    renderWithRouter(<PerformerCard performer={mockPerformer} />);
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify current implementation passes**

Run: `cd client && npm test -- --testPathPattern="PerformerCard.test" --watchAll=false`
Expected: PASS (existing implementation should pass)

**Step 3: Refactor to use BaseCard**

```javascript
// client/src/components/cards/PerformerCard.jsx
import { forwardRef } from "react";
import { BaseCard } from "../ui/BaseCard.jsx";
import { GenderIcon } from "../ui/GenderIcon.jsx";

/**
 * PerformerCard - Card for displaying performer entities
 * Uses BaseCard with performer-specific configuration
 */
const PerformerCard = forwardRef(
  ({ performer, referrerUrl, isTVMode, tabIndex, onHideSuccess, ...rest }, ref) => {
    const indicators = [
      { type: "PLAY_COUNT", count: performer.play_count },
      { type: "SCENES", count: performer.scene_count },
      { type: "GROUPS", count: performer.group_count },
      { type: "IMAGES", count: performer.image_count },
      { type: "GALLERIES", count: performer.gallery_count },
      { type: "TAGS", count: performer.tags?.length || 0 },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="performer"
        imagePath={performer.image_path}
        title={performer.name}
        linkTo={`/performer/${performer.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        hideDescription
        hideSubtitle
        indicators={indicators}
        ratingControlsProps={{
          entityId: performer.id,
          initialRating: performer.rating100,
          initialFavorite: performer.favorite || false,
          initialOCounter: performer.o_counter,
          onHideSuccess,
        }}
        renderAfterTitle={() => (
          <div className="flex items-center gap-1 mt-1">
            <GenderIcon gender={performer.gender} size={16} />
          </div>
        )}
        {...rest}
      />
    );
  }
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
```

**Step 4: Run test to verify it still passes**

Run: `cd client && npm test -- --testPathPattern="PerformerCard.test" --watchAll=false`
Expected: PASS

**Step 5: Run full build to verify no regressions**

Run: `cd client && npm run build`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add client/src/components/cards/PerformerCard.jsx client/src/components/cards/__tests__/PerformerCard.test.jsx
git commit -m "refactor(cards): migrate PerformerCard to use BaseCard"
```

---

### Task 6: Create GalleryCard

**Files:**
- Create: `client/src/components/cards/GalleryCard.jsx`
- Modify: `client/src/components/cards/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/cards/__tests__/GalleryCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { GalleryCard } from "../index";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("GalleryCard", () => {
  const mockGallery = {
    id: "1",
    title: "Test Gallery",
    paths: { cover: "/cover.jpg" },
    image_count: 25,
    studio: { name: "Test Studio" },
    date: "2024-01-15",
    performers: [{ id: "1", name: "Performer 1" }],
    tags: [{ id: "1", name: "Tag 1" }],
    rating100: 70,
    favorite: false,
  };

  it("renders gallery title", () => {
    renderWithRouter(<GalleryCard gallery={mockGallery} />);
    expect(screen.getByText("Test Gallery")).toBeInTheDocument();
  });

  it("renders studio and date subtitle", () => {
    renderWithRouter(<GalleryCard gallery={mockGallery} />);
    expect(screen.getByText(/Test Studio/)).toBeInTheDocument();
  });

  it("links to gallery detail page", () => {
    renderWithRouter(<GalleryCard gallery={mockGallery} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/gallery/1");
  });

  it("renders image count indicator", () => {
    renderWithRouter(<GalleryCard gallery={mockGallery} />);
    expect(screen.getByText("25")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="GalleryCard.test" --watchAll=false`
Expected: FAIL with module not found

**Step 3: Write GalleryCard implementation**

```javascript
// client/src/components/cards/GalleryCard.jsx
import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { galleryTitle } from "../../utils/gallery.js";

/**
 * GalleryCard - Card for displaying gallery entities
 */
const GalleryCard = forwardRef(
  ({ gallery, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    // Build subtitle from studio and date
    const galleryDate = gallery.date
      ? new Date(gallery.date).toLocaleDateString()
      : null;
    const subtitle = (() => {
      if (gallery.studio && galleryDate) {
        return `${gallery.studio.name} • ${galleryDate}`;
      } else if (gallery.studio) {
        return gallery.studio.name;
      } else if (galleryDate) {
        return galleryDate;
      }
      return null;
    })();

    // Build rich tooltip content for performers and tags
    const performersTooltip =
      gallery.performers &&
      gallery.performers.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={gallery.performers}
          title="Performers"
        />
      );

    const tagsTooltip =
      gallery.tags &&
      gallery.tags.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={gallery.tags}
          title="Tags"
        />
      );

    const indicators = [
      {
        type: "IMAGES",
        count: gallery.image_count,
        tooltipContent:
          gallery.image_count === 1 ? "1 Image" : `${gallery.image_count} Images`,
      },
      {
        type: "PERFORMERS",
        count: gallery.performers?.length || 0,
        tooltipContent: performersTooltip,
        onClick:
          gallery.performers?.length > 0
            ? () => navigate(`/performers?galleryId=${gallery.id}`)
            : undefined,
      },
      {
        type: "TAGS",
        count: gallery.tags?.length || 0,
        tooltipContent: tagsTooltip,
        onClick:
          gallery.tags?.length > 0
            ? () => navigate(`/tags?galleryId=${gallery.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="gallery"
        imagePath={gallery.paths?.cover}
        title={galleryTitle(gallery)}
        subtitle={subtitle}
        description={gallery.description}
        linkTo={`/gallery/${gallery.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={{
          entityId: gallery.id,
          initialRating: gallery.rating100,
          initialFavorite: gallery.favorite || false,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
```

**Step 4: Update cards/index.js**

```javascript
// client/src/components/cards/index.js
export { default as GalleryCard } from "./GalleryCard.jsx";
export { default as PerformerCard } from "./PerformerCard.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="GalleryCard.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/cards/GalleryCard.jsx client/src/components/cards/index.js client/src/components/cards/__tests__/GalleryCard.test.jsx
git commit -m "feat(cards): add GalleryCard using BaseCard"
```

---

### Task 7: Create GroupCard

**Files:**
- Create: `client/src/components/cards/GroupCard.jsx`
- Modify: `client/src/components/cards/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/cards/__tests__/GroupCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { GroupCard } from "../index";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("GroupCard", () => {
  const mockGroup = {
    id: "1",
    name: "Test Collection",
    front_image_path: "/front.jpg",
    scene_count: 15,
    sub_group_count: 3,
    performer_count: 5,
    studio: { name: "Test Studio" },
    date: "2024-01-15",
    tags: [{ id: "1", name: "Tag 1" }],
    rating100: 85,
    favorite: true,
  };

  it("renders group name", () => {
    renderWithRouter(<GroupCard group={mockGroup} />);
    expect(screen.getByText("Test Collection")).toBeInTheDocument();
  });

  it("links to collection detail page", () => {
    renderWithRouter(<GroupCard group={mockGroup} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/collection/1");
  });

  it("renders scene count indicator", () => {
    renderWithRouter(<GroupCard group={mockGroup} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="GroupCard.test" --watchAll=false`
Expected: FAIL

**Step 3: Write GroupCard implementation**

```javascript
// client/src/components/cards/GroupCard.jsx
import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * GroupCard - Card for displaying group/collection entities
 */
const GroupCard = forwardRef(
  ({ group, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    // Build subtitle from studio and date
    const subtitle = (() => {
      if (group.studio && group.date) {
        return `${group.studio.name} • ${group.date}`;
      } else if (group.studio) {
        return group.studio.name;
      } else if (group.date) {
        return group.date;
      }
      return null;
    })();

    const indicators = [
      {
        type: "SCENES",
        count: group.scene_count,
        onClick:
          group.scene_count > 0
            ? () => navigate(`/scenes?groupIds=${group.id}`)
            : undefined,
      },
      {
        type: "GROUPS",
        count: group.sub_group_count,
        onClick:
          group.sub_group_count > 0
            ? () => navigate(`/collections?groupIds=${group.id}`)
            : undefined,
      },
      {
        type: "PERFORMERS",
        count: group.performer_count,
        onClick:
          group.performer_count > 0
            ? () => navigate(`/performers?groupIds=${group.id}`)
            : undefined,
      },
      {
        type: "TAGS",
        count: group.tags?.length || 0,
        onClick:
          group.tags?.length > 0
            ? () => navigate(`/tags?groupIds=${group.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="group"
        imagePath={group.front_image_path || group.back_image_path}
        title={group.name}
        subtitle={subtitle}
        description={group.description}
        linkTo={`/collection/${group.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={{
          entityId: group.id,
          initialRating: group.rating100,
          initialFavorite: group.favorite || false,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

GroupCard.displayName = "GroupCard";

export default GroupCard;
```

**Step 4: Update cards/index.js**

```javascript
export { default as GalleryCard } from "./GalleryCard.jsx";
export { default as GroupCard } from "./GroupCard.jsx";
export { default as PerformerCard } from "./PerformerCard.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="GroupCard.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/cards/GroupCard.jsx client/src/components/cards/index.js client/src/components/cards/__tests__/GroupCard.test.jsx
git commit -m "feat(cards): add GroupCard using BaseCard"
```

---

### Task 8: Create StudioCard

**Files:**
- Create: `client/src/components/cards/StudioCard.jsx`
- Modify: `client/src/components/cards/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/cards/__tests__/StudioCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { StudioCard } from "../index";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("StudioCard", () => {
  const mockStudio = {
    id: "1",
    name: "Test Studio",
    image_path: "/studio.jpg",
    scene_count: 50,
    tags: [{ id: "1", name: "Tag 1" }],
    details: "Studio description",
    rating100: 90,
    favorite: false,
  };

  it("renders studio name", () => {
    renderWithRouter(<StudioCard studio={mockStudio} />);
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
  });

  it("links to studio detail page", () => {
    renderWithRouter(<StudioCard studio={mockStudio} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/studio/1");
  });

  it("renders scene count indicator", () => {
    renderWithRouter(<StudioCard studio={mockStudio} />);
    expect(screen.getByText("50")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="StudioCard.test" --watchAll=false`
Expected: FAIL

**Step 3: Write StudioCard implementation**

```javascript
// client/src/components/cards/StudioCard.jsx
import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * StudioCard - Card for displaying studio entities
 */
const StudioCard = forwardRef(
  ({ studio, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    const indicators = [
      {
        type: "SCENES",
        count: studio.scene_count,
        onClick:
          studio.scene_count > 0
            ? () => navigate(`/scenes?studioId=${studio.id}`)
            : undefined,
      },
      {
        type: "TAGS",
        count: studio.tags?.length || 0,
        onClick:
          studio.tags?.length > 0
            ? () => navigate(`/tags?studioId=${studio.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="studio"
        imagePath={studio.image_path}
        title={studio.name}
        description={studio.details}
        linkTo={`/studio/${studio.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={{
          entityId: studio.id,
          initialRating: studio.rating100,
          initialFavorite: studio.favorite || false,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

StudioCard.displayName = "StudioCard";

export default StudioCard;
```

**Step 4: Update cards/index.js**

```javascript
export { default as GalleryCard } from "./GalleryCard.jsx";
export { default as GroupCard } from "./GroupCard.jsx";
export { default as PerformerCard } from "./PerformerCard.jsx";
export { default as StudioCard } from "./StudioCard.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="StudioCard.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/cards/StudioCard.jsx client/src/components/cards/index.js client/src/components/cards/__tests__/StudioCard.test.jsx
git commit -m "feat(cards): add StudioCard using BaseCard"
```

---

### Task 9: Create TagCard

**Files:**
- Create: `client/src/components/cards/TagCard.jsx`
- Modify: `client/src/components/cards/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/cards/__tests__/TagCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { TagCard } from "../index";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("TagCard", () => {
  const mockTag = {
    id: "1",
    name: "Test Tag",
    image_path: "/tag.jpg",
    scene_count: 30,
    studio_count: 5,
    performer_count: 10,
    gallery_count: 8,
    description: "Tag description",
  };

  it("renders tag name", () => {
    renderWithRouter(<TagCard tag={mockTag} />);
    expect(screen.getByText("Test Tag")).toBeInTheDocument();
  });

  it("links to tag detail page", () => {
    renderWithRouter(<TagCard tag={mockTag} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tags/1");
  });

  it("renders scene count indicator", () => {
    renderWithRouter(<TagCard tag={mockTag} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="TagCard.test" --watchAll=false`
Expected: FAIL

**Step 3: Write TagCard implementation**

```javascript
// client/src/components/cards/TagCard.jsx
import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * TagCard - Card for displaying tag entities
 */
const TagCard = forwardRef(
  ({ tag, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    const indicators = [
      {
        type: "SCENES",
        count: tag.scene_count,
        onClick:
          tag.scene_count > 0
            ? () => navigate(`/scenes?tagIds=${tag.id}`)
            : undefined,
      },
      {
        type: "STUDIOS",
        count: tag.studio_count,
        onClick:
          tag.studio_count > 0
            ? () => navigate(`/studios?tagIds=${tag.id}`)
            : undefined,
      },
      {
        type: "PERFORMERS",
        count: tag.performer_count,
        onClick:
          tag.performer_count > 0
            ? () => navigate(`/performers?tagIds=${tag.id}`)
            : undefined,
      },
      {
        type: "GALLERIES",
        count: tag.gallery_count,
        onClick:
          tag.gallery_count > 0
            ? () => navigate(`/galleries?tagIds=${tag.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="tag"
        imagePath={tag.image_path}
        title={tag.name}
        description={tag.description}
        linkTo={`/tags/${tag.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={
          tag.rating100 !== undefined
            ? {
                entityId: tag.id,
                initialRating: tag.rating100,
                initialFavorite: tag.favorite || false,
                onHideSuccess,
              }
            : undefined
        }
        {...rest}
      />
    );
  }
);

TagCard.displayName = "TagCard";

export default TagCard;
```

**Step 4: Update cards/index.js**

```javascript
export { default as GalleryCard } from "./GalleryCard.jsx";
export { default as GroupCard } from "./GroupCard.jsx";
export { default as PerformerCard } from "./PerformerCard.jsx";
export { default as StudioCard } from "./StudioCard.jsx";
export { default as TagCard } from "./TagCard.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="TagCard.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/cards/TagCard.jsx client/src/components/cards/index.js client/src/components/cards/__tests__/TagCard.test.jsx
git commit -m "feat(cards): add TagCard using BaseCard"
```

---

### Task 10: Create ImageCard

**Files:**
- Create: `client/src/components/cards/ImageCard.jsx`
- Modify: `client/src/components/cards/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/cards/__tests__/ImageCard.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ImageCard } from "../index";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("ImageCard", () => {
  const mockImage = {
    id: "1",
    title: "Test Image",
    paths: { thumbnail: "/thumb.jpg", image: "/full.jpg" },
  };

  it("renders image title", () => {
    renderWithRouter(<ImageCard image={mockImage} />);
    expect(screen.getByText("Test Image")).toBeInTheDocument();
  });

  it("links to image detail page", () => {
    renderWithRouter(<ImageCard image={mockImage} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/image/1");
  });

  it("uses fallback title when no title provided", () => {
    const imageNoTitle = { ...mockImage, title: null };
    renderWithRouter(<ImageCard image={imageNoTitle} />);
    expect(screen.getByText("Image 1")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="ImageCard.test" --watchAll=false`
Expected: FAIL

**Step 3: Write ImageCard implementation**

```javascript
// client/src/components/cards/ImageCard.jsx
import { forwardRef } from "react";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * ImageCard - Card for displaying image entities
 */
const ImageCard = forwardRef(
  ({ image, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    return (
      <BaseCard
        ref={ref}
        entityType="image"
        imagePath={image.paths?.thumbnail || image.paths?.image}
        title={image.title || `Image ${image.id}`}
        linkTo={`/image/${image.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        hideDescription
        hideSubtitle
        indicators={[]}
        ratingControlsProps={
          image.rating100 !== undefined
            ? {
                entityId: image.id,
                initialRating: image.rating100,
                initialFavorite: image.favorite || false,
                onHideSuccess,
              }
            : undefined
        }
        {...rest}
      />
    );
  }
);

ImageCard.displayName = "ImageCard";

export default ImageCard;
```

**Step 4: Update cards/index.js**

```javascript
export { default as GalleryCard } from "./GalleryCard.jsx";
export { default as GroupCard } from "./GroupCard.jsx";
export { default as ImageCard } from "./ImageCard.jsx";
export { default as PerformerCard } from "./PerformerCard.jsx";
export { default as StudioCard } from "./StudioCard.jsx";
export { default as TagCard } from "./TagCard.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="ImageCard.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/cards/ImageCard.jsx client/src/components/cards/index.js client/src/components/cards/__tests__/ImageCard.test.jsx
git commit -m "feat(cards): add ImageCard using BaseCard"
```

---

## Phase 4: Grid Components

### Task 11: Create BaseGrid Component

**Files:**
- Create: `client/src/components/ui/BaseGrid.jsx`
- Create: `client/src/components/ui/__tests__/BaseGrid.test.jsx`
- Modify: `client/src/components/ui/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/ui/__tests__/BaseGrid.test.jsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { BaseGrid } from "../BaseGrid";

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("BaseGrid", () => {
  const mockItems = [
    { id: "1", name: "Item 1" },
    { id: "2", name: "Item 2" },
    { id: "3", name: "Item 3" },
  ];

  it("renders items using renderItem function", () => {
    renderWithRouter(
      <BaseGrid
        items={mockItems}
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
        gridType="standard"
      />
    );
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("shows loading skeleton when loading=true", () => {
    const { container } = renderWithRouter(
      <BaseGrid
        items={[]}
        renderItem={() => null}
        gridType="standard"
        loading={true}
        skeletonCount={3}
      />
    );
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });

  it("shows empty message when items is empty", () => {
    renderWithRouter(
      <BaseGrid
        items={[]}
        renderItem={() => null}
        gridType="standard"
        emptyMessage="No items found"
      />
    );
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders pagination when totalPages > 1", () => {
    renderWithRouter(
      <BaseGrid
        items={mockItems}
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
        gridType="standard"
        currentPage={1}
        totalPages={5}
        onPageChange={() => {}}
      />
    );
    // Should have pagination controls
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="BaseGrid.test" --watchAll=false`
Expected: FAIL

**Step 3: Write BaseGrid implementation**

```javascript
// client/src/components/ui/BaseGrid.jsx
import { SCENE_GRID_CONTAINER_CLASSNAMES, STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import EmptyState from "./EmptyState.jsx";
import Pagination from "./Pagination.jsx";

/**
 * BaseGrid - Base grid component for layout, responsive columns, pagination, and loading/empty states
 *
 * @param {Object} props
 * @param {any[]} props.items - Array of items to render
 * @param {Function} props.renderItem - Function to render each item (item, index) => ReactNode
 * @param {'scene'|'standard'} props.gridType - Grid type for responsive columns
 * @param {boolean} [props.loading] - Show loading skeleton
 * @param {Error} [props.error] - Error to display
 * @param {string} [props.emptyMessage] - Message when no items
 * @param {string} [props.emptyDescription] - Description for empty state
 * @param {number} [props.currentPage] - Current page number
 * @param {number} [props.totalPages] - Total number of pages
 * @param {Function} [props.onPageChange] - Page change handler (page: number) => void
 * @param {number} [props.skeletonCount] - Number of skeleton cards to show while loading
 * @param {Function} [props.renderSkeleton] - Custom skeleton renderer
 * @param {string} [props.className] - Additional CSS classes
 */
export const BaseGrid = ({
  items,
  renderItem,
  gridType = "standard",
  loading = false,
  error,
  emptyMessage = "No items found",
  emptyDescription,
  currentPage,
  totalPages,
  onPageChange,
  skeletonCount = 12,
  renderSkeleton,
  className = "",
}) => {
  const gridClasses =
    gridType === "scene"
      ? SCENE_GRID_CONTAINER_CLASSNAMES
      : STANDARD_GRID_CONTAINER_CLASSNAMES;

  // Default skeleton renderer
  const defaultRenderSkeleton = () => (
    <div
      className="rounded-lg animate-pulse"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        height: gridType === "scene" ? "20rem" : "24rem",
      }}
    />
  );

  const skeletonRenderer = renderSkeleton || defaultRenderSkeleton;

  // Loading state
  if (loading) {
    return (
      <div className={`${gridClasses} ${className}`}>
        {[...Array(skeletonCount)].map((_, i) => (
          <div key={i}>{skeletonRenderer()}</div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <EmptyState
        title="Error loading items"
        description={error.message || "An error occurred"}
      />
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  return (
    <>
      <div className={`${gridClasses} ${className}`}>
        {items.map((item, index) => renderItem(item, index))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <nav role="navigation" aria-label="Pagination" className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </nav>
      )}
    </>
  );
};

export default BaseGrid;
```

**Step 4: Add export to index.js**

Add to `client/src/components/ui/index.js`:

```javascript
export { BaseGrid } from "./BaseGrid.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="BaseGrid.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/ui/BaseGrid.jsx client/src/components/ui/__tests__/BaseGrid.test.jsx client/src/components/ui/index.js
git commit -m "feat(grids): add BaseGrid component for grid layout and pagination"
```

---

### Task 12: Create SearchableGrid Component

**Files:**
- Create: `client/src/components/ui/SearchableGrid.jsx`
- Modify: `client/src/components/ui/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/ui/__tests__/SearchableGrid.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { SearchableGrid } from "../SearchableGrid";

// Mock the libraryApi
jest.mock("../../../services/api", () => ({
  libraryApi: {
    findPerformers: jest.fn().mockResolvedValue({
      findPerformers: {
        performers: [
          { id: "1", name: "Test Performer" },
        ],
        count: 1,
      },
    }),
  },
}));

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("SearchableGrid", () => {
  it("renders search controls", async () => {
    renderWithRouter(
      <SearchableGrid
        entityType="performer"
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Test Performer")).toBeInTheDocument();
    });
  });

  it("applies locked filters without showing them in UI", async () => {
    renderWithRouter(
      <SearchableGrid
        entityType="performer"
        lockedFilters={{ studio_id: "123" }}
        hideLockedFilters
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Test Performer")).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="SearchableGrid.test" --watchAll=false`
Expected: FAIL

**Step 3: Write SearchableGrid implementation**

```javascript
// client/src/components/ui/SearchableGrid.jsx
import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import BaseGrid from "./BaseGrid.jsx";
import SearchControls from "./SearchControls.jsx";

/**
 * SearchableGrid - BaseGrid with integrated search controls and data fetching
 *
 * @param {Object} props
 * @param {'scene'|'performer'|'gallery'|'group'|'studio'|'tag'|'image'} props.entityType
 * @param {Object} [props.lockedFilters] - Filters that cannot be changed by user
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {'scene'|'standard'} [props.gridType] - Grid layout type
 * @param {Function} props.renderItem - Function to render each item
 * @param {Object} [props.defaultSort] - Default sort configuration
 * @param {Object} [props.defaultFilters] - Default filters
 * @param {Function} [props.onResultsChange] - Callback when results change
 * @param {string} [props.emptyMessage] - Empty state message
 * @param {string} [props.emptyDescription] - Empty state description
 * @param {number} [props.skeletonCount] - Number of skeleton items during loading
 * @param {boolean} [props.syncToUrl] - Whether to sync state to URL (default: true)
 */
export const SearchableGrid = ({
  entityType,
  lockedFilters = {},
  hideLockedFilters = false,
  gridType = "standard",
  renderItem,
  defaultSort = "name",
  defaultFilters = {},
  onResultsChange,
  emptyMessage,
  emptyDescription,
  skeletonCount = 24,
  syncToUrl = true,
}) => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [searchParams] = useSearchParams();

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // API method mapping
  const apiMethods = {
    scene: "findScenes",
    performer: "findPerformers",
    gallery: "findGalleries",
    group: "findGroups",
    studio: "findStudios",
    tag: "findTags",
    image: "findImages",
  };

  // Response key mapping
  const responseKeys = {
    scene: "findScenes",
    performer: "findPerformers",
    gallery: "findGalleries",
    group: "findGroups",
    studio: "findStudios",
    tag: "findTags",
    image: "findImages",
  };

  // Data array key mapping
  const dataKeys = {
    scene: "scenes",
    performer: "performers",
    gallery: "galleries",
    group: "groups",
    studio: "studios",
    tag: "tags",
    image: "images",
  };

  const handleQueryChange = useCallback(
    async (newQuery) => {
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

      // Merge locked filters into query
      const mergedQuery = {
        ...newQuery,
        ...lockedFilters,
      };

      // Avoid duplicate queries
      if (lastQuery && deepEqual(mergedQuery, lastQuery)) {
        return;
      }

      try {
        setIsLoading(true);
        setLastQuery(mergedQuery);
        setError(null);

        const apiMethod = apiMethods[entityType];
        const responseKey = responseKeys[entityType];
        const dataKey = dataKeys[entityType];

        const result = await libraryApi[apiMethod](mergedQuery);
        const items = result[responseKey]?.[dataKey] || [];
        const count = result[responseKey]?.count || 0;

        setData(items);
        setTotalCount(count);
        onResultsChange?.({ items, count });
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [entityType, lockedFilters, lastQuery, isAuthLoading, isAuthenticated, onResultsChange]
  );

  // Handle successful hide - remove item from local state
  const handleHideSuccess = useCallback((entityId) => {
    setData((prevData) => prevData.filter((item) => item.id !== entityId));
    setTotalCount((prevCount) => Math.max(0, prevCount - 1));
  }, []);

  // Calculate pagination
  const currentPerPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / currentPerPage);

  // Build filter key for locked filters if we need to hide them
  const permanentFiltersMetadata = hideLockedFilters ? {} : lockedFilters;

  return (
    <SearchControls
      artifactType={entityType}
      initialSort={defaultSort}
      onQueryChange={handleQueryChange}
      permanentFilters={lockedFilters}
      permanentFiltersMetadata={permanentFiltersMetadata}
      totalPages={totalPages}
      totalCount={totalCount}
      syncToUrl={syncToUrl}
    >
      <BaseGrid
        items={data}
        renderItem={(item, index) =>
          renderItem(item, index, { onHideSuccess: handleHideSuccess })
        }
        gridType={gridType}
        loading={isLoading}
        error={error}
        emptyMessage={emptyMessage || `No ${entityType}s found`}
        emptyDescription={emptyDescription}
        skeletonCount={skeletonCount}
      />
    </SearchControls>
  );
};

export default SearchableGrid;
```

**Step 4: Add export to index.js**

Add to `client/src/components/ui/index.js`:

```javascript
export { SearchableGrid } from "./SearchableGrid.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="SearchableGrid.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/ui/SearchableGrid.jsx client/src/components/ui/__tests__/SearchableGrid.test.jsx client/src/components/ui/index.js
git commit -m "feat(grids): add SearchableGrid with integrated search controls and data fetching"
```

---

### Task 13: Create grids directory structure

**Files:**
- Create: `client/src/components/grids/`
- Create: `client/src/components/grids/index.js`

**Step 1: Create directory and index**

```javascript
// client/src/components/grids/index.js
// Entity grid components will be exported here
```

**Step 2: Commit**

```bash
git add client/src/components/grids/
git commit -m "chore: create grids directory structure"
```

---

### Task 14: Create PerformerGrid

**Files:**
- Create: `client/src/components/grids/PerformerGrid.jsx`
- Modify: `client/src/components/grids/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/grids/__tests__/PerformerGrid.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { PerformerGrid } from "../index";

jest.mock("../../../services/api", () => ({
  libraryApi: {
    findPerformers: jest.fn().mockResolvedValue({
      findPerformers: {
        performers: [
          { id: "1", name: "Test Performer", image_path: "/test.jpg" },
        ],
        count: 1,
      },
    }),
  },
}));

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("PerformerGrid", () => {
  it("renders performers from API", async () => {
    renderWithRouter(<PerformerGrid />);

    await waitFor(() => {
      expect(screen.getByText("Test Performer")).toBeInTheDocument();
    });
  });

  it("supports locked filters for nested grids", async () => {
    renderWithRouter(
      <PerformerGrid
        lockedFilters={{ studio_id: "123" }}
        hideLockedFilters
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Test Performer")).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --testPathPattern="PerformerGrid.test" --watchAll=false`
Expected: FAIL

**Step 3: Write PerformerGrid implementation**

```javascript
// client/src/components/grids/PerformerGrid.jsx
import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { PerformerCard } from "../cards/index.js";

/**
 * PerformerGrid - Grid for displaying performers with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 */
const PerformerGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No performers found",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="performer"
      gridType="standard"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="o_counter"
      renderItem={(performer, _index, { onHideSuccess }) => (
        <PerformerCard
          key={performer.id}
          performer={performer}
          onHideSuccess={() => onHideSuccess(performer.id)}
        />
      )}
      {...rest}
    />
  );
};

export default PerformerGrid;
```

**Step 4: Update grids/index.js**

```javascript
export { default as PerformerGrid } from "./PerformerGrid.jsx";
```

**Step 5: Run test to verify it passes**

Run: `cd client && npm test -- --testPathPattern="PerformerGrid.test" --watchAll=false`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/grids/PerformerGrid.jsx client/src/components/grids/index.js client/src/components/grids/__tests__/PerformerGrid.test.jsx
git commit -m "feat(grids): add PerformerGrid component"
```

---

### Task 15: Create GalleryGrid

**Files:**
- Create: `client/src/components/grids/GalleryGrid.jsx`
- Modify: `client/src/components/grids/index.js`

**Step 1: Write the failing test**

```javascript
// client/src/components/grids/__tests__/GalleryGrid.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { GalleryGrid } from "../index";

jest.mock("../../../services/api", () => ({
  libraryApi: {
    findGalleries: jest.fn().mockResolvedValue({
      findGalleries: {
        galleries: [
          { id: "1", title: "Test Gallery", paths: { cover: "/test.jpg" } },
        ],
        count: 1,
      },
    }),
  },
}));

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe("GalleryGrid", () => {
  it("renders galleries from API", async () => {
    renderWithRouter(<GalleryGrid />);

    await waitFor(() => {
      expect(screen.getByText("Test Gallery")).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run test, write implementation, verify**

```javascript
// client/src/components/grids/GalleryGrid.jsx
import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { GalleryCard } from "../cards/index.js";

const GalleryGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No galleries found",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="gallery"
      gridType="standard"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="date"
      renderItem={(gallery, _index, { onHideSuccess }) => (
        <GalleryCard
          key={gallery.id}
          gallery={gallery}
          onHideSuccess={() => onHideSuccess(gallery.id)}
        />
      )}
      {...rest}
    />
  );
};

export default GalleryGrid;
```

**Step 3: Update index, run test, commit**

```bash
git add client/src/components/grids/GalleryGrid.jsx client/src/components/grids/index.js client/src/components/grids/__tests__/GalleryGrid.test.jsx
git commit -m "feat(grids): add GalleryGrid component"
```

---

### Task 16: Create GroupGrid

**Files:**
- Create: `client/src/components/grids/GroupGrid.jsx`
- Modify: `client/src/components/grids/index.js`

Similar pattern to GalleryGrid - implement and test.

**Commit:**
```bash
git commit -m "feat(grids): add GroupGrid component"
```

---

### Task 17: Create StudioGrid

**Files:**
- Create: `client/src/components/grids/StudioGrid.jsx`
- Modify: `client/src/components/grids/index.js`

Similar pattern - implement and test.

**Commit:**
```bash
git commit -m "feat(grids): add StudioGrid component"
```

---

### Task 18: Create TagGrid

**Files:**
- Create: `client/src/components/grids/TagGrid.jsx`
- Modify: `client/src/components/grids/index.js`

Similar pattern - implement and test.

**Commit:**
```bash
git commit -m "feat(grids): add TagGrid component"
```

---

### Task 19: Create ImageGrid

**Files:**
- Create: `client/src/components/grids/ImageGrid.jsx`
- Modify: `client/src/components/grids/index.js`

Similar pattern - implement and test.

**Commit:**
```bash
git commit -m "feat(grids): add ImageGrid component"
```

---

## Phase 5: Migration & Cleanup

### Task 20: Update PerformerDetail to use new grid components

**Files:**
- Modify: `client/src/components/pages/PerformerDetail.jsx`

**Step 1: Verify existing behavior works**

Run: `cd client && npm run build && npm run preview`
Navigate to a performer detail page and verify tabs work.

**Step 2: Update imports**

```javascript
// In PerformerDetail.jsx, replace:
import { EntityGrid } from "../ui/index.js";

// With:
import { GalleryGrid, GroupGrid } from "../grids/index.js";
```

**Step 3: Replace EntityGrid usage**

Replace galleries tab content:
```jsx
{activeTab === 'galleries' && (
  <GalleryGrid
    lockedFilters={{
      gallery_filter: {
        performers: {
          value: [parseInt(performerId, 10)],
          modifier: "INCLUDES",
        },
      },
    }}
    hideLockedFilters
    emptyMessage={`No galleries found for ${performer.name}`}
  />
)}
```

Replace groups tab content:
```jsx
{activeTab === 'groups' && (
  <GroupGrid
    lockedFilters={{
      group_filter: {
        performers: {
          value: [parseInt(performerId, 10)],
          modifier: "INCLUDES",
        },
      },
    }}
    hideLockedFilters
    emptyMessage={`No collections found for ${performer.name}`}
  />
)}
```

**Step 4: Verify changes work**

Run: `cd client && npm run build && npm run preview`
Navigate to performer detail page, verify all tabs still work.

**Step 5: Commit**

```bash
git add client/src/components/pages/PerformerDetail.jsx
git commit -m "refactor(pages): update PerformerDetail to use new grid components"
```

---

### Task 21: Update remaining detail pages

**Files:**
- Modify: `client/src/components/pages/StudioDetail.jsx`
- Modify: `client/src/components/pages/TagDetail.jsx`
- Modify: `client/src/components/pages/GroupDetail.jsx`
- Modify: `client/src/components/pages/GalleryDetail.jsx`

Follow same pattern as Task 20 for each page.

**Commit after each page:**
```bash
git commit -m "refactor(pages): update StudioDetail to use new grid components"
git commit -m "refactor(pages): update TagDetail to use new grid components"
# etc.
```

---

### Task 22: Delete deprecated GridCard.jsx

**Files:**
- Delete: `client/src/components/ui/GridCard.jsx`
- Modify: `client/src/components/ui/index.js` (remove export)

**Step 1: Search for GridCard usages**

Run: `grep -r "GridCard" client/src --include="*.jsx" --include="*.js"`

**Step 2: Ensure no remaining usages**

All usages should have been replaced by BaseCard-based components.

**Step 3: Delete and update exports**

```bash
git rm client/src/components/ui/GridCard.jsx
```

Update index.js to remove:
```javascript
// Remove this line:
export { GridCard } from "./GridCard.jsx";
```

**Step 4: Verify build**

Run: `cd client && npm run build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add client/src/components/ui/index.js
git commit -m "refactor(cards): delete deprecated GridCard.jsx"
```

---

### Task 23: Delete deprecated EntityGrid.jsx

**Files:**
- Delete: `client/src/components/ui/EntityGrid.jsx`
- Modify: `client/src/components/ui/index.js`

Follow same pattern as Task 22.

**Commit:**
```bash
git commit -m "refactor(grids): delete deprecated EntityGrid.jsx"
```

---

### Task 24: Run full test suite and fix any issues

**Step 1: Run all tests**

Run: `cd client && npm test -- --watchAll=false`

**Step 2: Fix any failing tests**

Update snapshots if needed, fix any regressions.

**Step 3: Run build**

Run: `cd client && npm run build`

**Step 4: Manual testing**

Test all pages in browser:
- Scenes page
- Performers page + detail
- Galleries page + detail
- Collections page + detail
- Studios page + detail
- Tags page + detail

**Step 5: Commit any fixes**

```bash
git commit -m "fix: address test failures after card/grid refactor"
```

---

### Task 25: Update documentation

**Files:**
- Modify: `docs/architecture/components.md` (if exists)
- Or create brief documentation in README

Document the new component hierarchy:
- Primitives (CardComponents.jsx)
- BaseCard + BaseGrid
- Entity Cards (components/cards/)
- Entity Grids (components/grids/)

**Commit:**
```bash
git commit -m "docs: update component documentation for card/grid refactor"
```

---

## Final Checklist

- [ ] All tests pass
- [ ] Build succeeds without warnings
- [ ] All entity types have dedicated Card components
- [ ] All entity types have dedicated Grid components
- [ ] Nested grids work with locked filters on detail pages
- [ ] No deprecated components remain (GridCard, EntityGrid)
- [ ] Visual appearance matches pre-refactor state
- [ ] TV mode still functions correctly
- [ ] Selection mode in SceneGrid still works

---

**Plan complete and saved to `docs/plans/2025-01-12-card-grid-refactor-implementation.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
