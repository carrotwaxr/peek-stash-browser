# Scene URLs Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display scene URLs in the Scene Details card so users can purchase content from creators.

**Architecture:** Extract existing `getSiteInfo()` and `SectionLink` from PerformerDetail into shared utilities. Add new site mappings for major studios. Implement dynamic favicon fallback. Add URLs section to SceneDetails after Tags.

**Tech Stack:** React, Lucide icons, CSS-in-JS (inline styles)

---

## Task 1: Create Shared Site Info Utility

**Files:**
- Create: `client/src/utils/siteInfo.js`

**Step 1: Create the utility file with existing + new site mappings**

```javascript
import {
  LucideDatabase,
  LucideFacebook,
  LucideFilm,
  LucideGlobe,
  LucideInstagram,
  LucideLink,
  LucideTwitter,
  LucideVideo,
} from "lucide-react";

/**
 * Site information for URL display
 * Returns name, icon component, and brand color for known sites
 */
export const getSiteInfo = (url) => {
  const urlLower = url.toLowerCase();

  // === Social Media ===
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) {
    return { name: "Twitter", icon: LucideTwitter, color: "#1DA1F2" };
  }
  if (urlLower.includes("instagram.com")) {
    return { name: "Instagram", icon: LucideInstagram, color: "#E4405F" };
  }
  if (urlLower.includes("facebook.com")) {
    return { name: "Facebook", icon: LucideFacebook, color: "#1877F2" };
  }
  if (urlLower.includes("onlyfans.com")) {
    return { name: "OnlyFans", icon: LucideVideo, color: "#00AFF0" };
  }

  // === Entertainment Databases ===
  if (urlLower.includes("imdb.com")) {
    return { name: "IMDb", icon: LucideFilm, color: "#F5C518" };
  }

  // === Adult Industry Databases ===
  if (urlLower.includes("iafd.com")) {
    return { name: "IAFD", icon: LucideDatabase, color: "#9B59B6" };
  }
  if (urlLower.includes("adultfilmdatabase.com")) {
    return { name: "AFDB", icon: LucideDatabase, color: "#16A085" };
  }
  if (urlLower.includes("freeones.com")) {
    return { name: "FreeOnes", icon: LucideDatabase, color: "#E67E22" };
  }
  if (urlLower.includes("babepedia.com")) {
    return { name: "Babepedia", icon: LucideDatabase, color: "#E91E63" };
  }
  if (urlLower.includes("data18.com")) {
    return { name: "Data18", icon: LucideDatabase, color: "#27AE60" };
  }
  if (urlLower.includes("indexxx.com")) {
    return { name: "Indexxx", icon: LucideDatabase, color: "#8E44AD" };
  }
  if (urlLower.includes("thenude.com")) {
    return { name: "The Nude", icon: LucideDatabase, color: "#1ABC9C" };
  }
  if (urlLower.includes("pornteengirl.com")) {
    return { name: "PornTeenGirl", icon: LucideGlobe, color: "#2ECC71" };
  }

  // === Major Studio Networks ===
  if (urlLower.includes("brazzers.com")) {
    return { name: "Brazzers", icon: LucideGlobe, color: "#FFA500" };
  }
  if (urlLower.includes("realitykings.com")) {
    return { name: "Reality Kings", icon: LucideGlobe, color: "#FFD700" };
  }
  if (urlLower.includes("bangbros.com")) {
    return { name: "Bang Bros", icon: LucideGlobe, color: "#FF6B6B" };
  }
  if (urlLower.includes("naughtyamerica.com")) {
    return { name: "Naughty America", icon: LucideGlobe, color: "#E74C3C" };
  }
  if (urlLower.includes("mofos.com")) {
    return { name: "Mofos", icon: LucideGlobe, color: "#3498DB" };
  }
  if (urlLower.includes("digitalplayground.com")) {
    return { name: "Digital Playground", icon: LucideGlobe, color: "#9B59B6" };
  }
  if (urlLower.includes("wicked.com")) {
    return { name: "Wicked Pictures", icon: LucideGlobe, color: "#E91E63" };
  }

  // === Premium/Artistic Studios ===
  if (urlLower.includes("vixen.com")) {
    return { name: "Vixen", icon: LucideGlobe, color: "#000000" };
  }
  if (urlLower.includes("tushy.com")) {
    return { name: "Tushy", icon: LucideGlobe, color: "#FF69B4" };
  }
  if (urlLower.includes("blacked.com")) {
    return { name: "Blacked", icon: LucideGlobe, color: "#1C1C1C" };
  }
  if (urlLower.includes("deeper.com")) {
    return { name: "Deeper", icon: LucideGlobe, color: "#2C3E50" };
  }
  if (urlLower.includes("slayed.com")) {
    return { name: "Slayed", icon: LucideGlobe, color: "#8B0000" };
  }
  if (urlLower.includes("bellesa.co") || urlLower.includes("bellesafilms.com")) {
    return { name: "Bellesa", icon: LucideGlobe, color: "#FF6B9D" };
  }
  if (urlLower.includes("x-art.com")) {
    return { name: "X-Art", icon: LucideGlobe, color: "#C0C0C0" };
  }
  if (urlLower.includes("sexart.com")) {
    return { name: "SexArt", icon: LucideGlobe, color: "#D4AF37" };
  }

  // === Unknown site - extract domain ===
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    return { name: domain, icon: LucideLink, color: "#95A5A6", useFavicon: true };
  } catch {
    return { name: "Link", icon: LucideLink, color: "#95A5A6" };
  }
};

/**
 * Extract domain from URL for favicon fetching
 */
export const getDomainFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return null;
  }
};
```

**Step 2: Commit**

```bash
git add client/src/utils/siteInfo.js
git commit -m "feat: add shared site info utility with studio mappings"
```

---

## Task 2: Create Shared SectionLink Component

**Files:**
- Create: `client/src/components/ui/SectionLink.jsx`
- Modify: `client/src/components/ui/index.js`

**Step 1: Create the SectionLink component with favicon fallback**

```jsx
import { useState } from "react";
import { getSiteInfo, getDomainFromUrl } from "../../utils/siteInfo.js";

/**
 * External link component with site icon/favicon
 * Shows site-specific icons for known sites, attempts favicon for unknown sites
 */
const SectionLink = ({ url }) => {
  const [faviconError, setFaviconError] = useState(false);

  if (!url) return null;

  const { name, icon: Icon, color, useFavicon } = getSiteInfo(url);
  const domain = getDomainFromUrl(url);
  const faviconUrl = domain ? `${domain}/favicon.ico` : null;

  // Show favicon for unknown sites, fall back to icon if favicon fails
  const showFavicon = useFavicon && faviconUrl && !faviconError;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-80"
      style={{
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {showFavicon ? (
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          onError={() => setFaviconError(true)}
          style={{ borderRadius: 2 }}
        />
      ) : (
        <Icon size={16} style={{ color }} />
      )}
      <span>{name}</span>
    </a>
  );
};

export default SectionLink;
```

**Step 2: Export from ui/index.js**

Add this line in alphabetical order (after SearchInput, before Sidebar):

```javascript
export { default as SectionLink } from "./SectionLink.jsx";
```

**Step 3: Commit**

```bash
git add client/src/components/ui/SectionLink.jsx client/src/components/ui/index.js
git commit -m "feat: add SectionLink component with favicon fallback"
```

---

## Task 3: Add URLs to SceneDetails Component

**Files:**
- Modify: `client/src/components/pages/SceneDetails.jsx:1-5` (imports)
- Modify: `client/src/components/pages/SceneDetails.jsx:335-369` (after Tags section)

**Step 1: Add SectionLink import**

Change line 3 from:
```javascript
import { Paper, useLazyLoad } from "../ui/index.js";
```

To:
```javascript
import { Paper, SectionLink, useLazyLoad } from "../ui/index.js";
```

**Step 2: Add URLs section after Tags**

After the Tags section (ends at line 369), add the URLs section. Insert after line 369 (after the closing of the Tags IIFE):

```jsx
                {/* URLs/Links */}
                {scene.urls && scene.urls.length > 0 && (
                  <div className="mt-6">
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Links
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {scene.urls.map((url, index) => (
                        <SectionLink key={index} url={url} />
                      ))}
                    </div>
                  </div>
                )}
```

**Step 3: Commit**

```bash
git add client/src/components/pages/SceneDetails.jsx
git commit -m "feat: display scene URLs in details panel"
```

---

## Task 4: Add URLs to Server Transform Functions

**Files:**
- Modify: `server/services/StashEntityService.ts:1347-1403` (transformScene)
- Modify: `server/services/StashEntityService.ts:1408-1480` (transformSceneForBrowse)

**Step 1: Add urls to transformScene method**

In the `transformScene` method (around line 1347), after the `organized` field (line 1359), add:

```typescript
      // URLs
      urls: scene.urls ? JSON.parse(scene.urls) : [],
```

**Step 2: Add urls to transformSceneForBrowse method**

In the `transformSceneForBrowse` method (around line 1408), after the `organized` field (line 1419), add the same:

```typescript
      // URLs
      urls: scene.urls ? JSON.parse(scene.urls) : [],
```

**Step 3: Commit**

```bash
git add server/services/StashEntityService.ts
git commit -m "feat: include urls in scene transformation"
```

---

## Task 5: Refactor PerformerDetail to Use Shared Utilities

**Files:**
- Modify: `client/src/components/pages/PerformerDetail.jsx:1-35` (imports)
- Modify: `client/src/components/pages/PerformerDetail.jsx:36-92` (remove getSiteInfo)
- Modify: `client/src/components/pages/PerformerDetail.jsx:391-413` (remove SectionLink)
- Modify: `client/src/components/pages/PerformerDetail.jsx:747-760` (update usage)

**Step 1: Update imports**

Remove these imports from the lucide-react import (lines 3-14):
- `LucideDatabase`
- `LucideFacebook`
- `LucideFilm`
- `LucideGlobe`
- `LucideInstagram`
- `LucideLink`
- `LucideTwitter`
- `LucideVideo`

Keep only:
```javascript
import {
  ArrowLeft,
  LucideStar,
} from "lucide-react";
```

Add import for SectionLink after line 34:
```javascript
import { SectionLink } from "../ui/index.js";
```

**Step 2: Remove local getSiteInfo function**

Delete lines 36-92 (the entire `getSiteInfo` function).

**Step 3: Remove local SectionLink component**

Delete lines 391-413 (the entire `SectionLink` component, including the comment above it).

**Step 4: Verify SectionLink usage remains correct**

The existing usage at lines 749, 751, 754, 759 should continue to work as-is since we're importing the same component interface.

**Step 5: Commit**

```bash
git add client/src/components/pages/PerformerDetail.jsx
git commit -m "refactor: use shared SectionLink in PerformerDetail"
```

---

## Task 6: Test and Verify

**Step 1: Run the build to check for errors**

```bash
cd server && npm run build
cd ../client && npm run build
```

**Step 2: Start the dev server and manually test**

```bash
cd server && npm run dev
# In another terminal:
cd client && npm run dev
```

**Manual testing checklist:**
- [ ] Navigate to a scene that has URLs in Stash
- [ ] Verify URLs appear in the Details panel after Tags
- [ ] Verify known sites (Brazzers, Vixen, etc.) show proper names
- [ ] Verify unknown sites show domain name with favicon attempt
- [ ] Verify clicking links opens in new tab
- [ ] Navigate to PerformerDetail - verify links still work

**Step 3: Commit any fixes if needed, then final verification**

```bash
git status
# If clean, you're done!
```

---

## Summary

This implementation:
1. Extracts site info logic into a reusable utility with 20+ known sites
2. Creates a shared SectionLink component with dynamic favicon fallback
3. Adds the URLs section to SceneDetails after Tags
4. Ensures the server includes `urls` in scene data
5. Refactors PerformerDetail to use the shared utilities (DRY)

Total: 6 tasks, ~45 minutes estimated
