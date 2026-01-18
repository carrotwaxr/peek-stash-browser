# Post-Login Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a user preference to configure which page to land on after login, with optional randomization.

**Architecture:** New `landingPagePreference` JSON field on User model. Login flow reads preference and navigates accordingly. Settings UI in Navigation tab allows configuration.

**Tech Stack:** React, Prisma (SQLite), Express, react-router-dom

**Design Doc:** [2026-01-17-post-login-landing-page-design.md](./2026-01-17-post-login-landing-page-design.md)

---

### Task 1: Add Database Field

**Files:**
- Modify: `server/prisma/schema.prisma:10-68` (User model)

**Step 1: Add field to User model**

In `server/prisma/schema.prisma`, add after line 31 (after `cardDisplaySettings`):

```prisma
  landingPagePreference  Json?  @default("{\"pages\":[\"home\"],\"randomize\":false}")
```

**Step 2: Generate migration**

Run:
```bash
cd server && npx prisma migrate dev --name add_landing_page_preference
```

Expected: Migration creates successfully, schema.prisma updated.

**Step 3: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat(db): add landingPagePreference field to User model (#290)"
```

---

### Task 2: Add Landing Page Constants

**Files:**
- Modify: `client/src/constants/navigation.js`

**Step 1: Add LANDING_PAGE_OPTIONS constant**

Add after line 69 (after `NAV_DEFINITIONS`):

```javascript
/**
 * Landing page options for post-login redirect
 * Order matters - this is the display order in settings
 */
export const LANDING_PAGE_OPTIONS = [
  { key: "home", label: "Home", path: "/" },
  { key: "scenes", label: "Scenes", path: "/scenes" },
  { key: "performers", label: "Performers", path: "/performers" },
  { key: "studios", label: "Studios", path: "/studios" },
  { key: "tags", label: "Tags", path: "/tags" },
  { key: "collections", label: "Collections", path: "/collections" },
  { key: "galleries", label: "Galleries", path: "/galleries" },
  { key: "images", label: "Images", path: "/images" },
  { key: "playlists", label: "Playlists", path: "/playlists" },
  { key: "recommended", label: "Recommended", path: "/recommended" },
  { key: "watch-history", label: "Watch History", path: "/watch-history" },
  { key: "user-stats", label: "User Stats", path: "/user-stats" },
];

/**
 * Get the path for a landing page key
 * @param {string} key - Landing page key
 * @returns {string} Path for the landing page, defaults to "/"
 */
export const getLandingPagePath = (key) => {
  const option = LANDING_PAGE_OPTIONS.find((opt) => opt.key === key);
  return option?.path || "/";
};

/**
 * Get the landing page destination based on user preference
 * @param {Object} preference - User's landing page preference {pages: string[], randomize: boolean}
 * @returns {string} Path to navigate to
 */
export const getLandingPage = (preference) => {
  // Default fallback
  if (!preference || !preference.pages?.length) {
    return "/";
  }

  if (preference.randomize && preference.pages.length > 1) {
    const randomIndex = Math.floor(Math.random() * preference.pages.length);
    return getLandingPagePath(preference.pages[randomIndex]);
  }

  return getLandingPagePath(preference.pages[0]);
};
```

**Step 2: Commit**

```bash
git add client/src/constants/navigation.js
git commit -m "feat(client): add landing page options and helper functions (#290)"
```

---

### Task 3: Update Server Settings API

**Files:**
- Modify: `server/controllers/user.ts:106-168` (getUserSettings)
- Modify: `server/controllers/user.ts:173-438` (updateUserSettings)

**Step 1: Add landingPagePreference to getUserSettings select and response**

In `getUserSettings` function, add to the `select` object (around line 137):

```typescript
        landingPagePreference: true,
```

And in the response `settings` object (around line 161):

```typescript
        landingPagePreference: user.landingPagePreference || { pages: ["home"], randomize: false },
```

**Step 2: Add landingPagePreference to updateUserSettings**

In `updateUserSettings` function, add to destructuring (around line 212):

```typescript
      landingPagePreference,
```

Add validation after the cardDisplaySettings validation (around line 379):

```typescript
    // Validate landing page preference if provided
    if (landingPagePreference !== undefined) {
      if (landingPagePreference !== null && typeof landingPagePreference !== "object") {
        return res
          .status(400)
          .json({ error: "Landing page preference must be an object or null" });
      }

      if (landingPagePreference !== null) {
        if (!Array.isArray(landingPagePreference.pages) || landingPagePreference.pages.length === 0) {
          return res
            .status(400)
            .json({ error: "Landing page preference must have at least one page" });
        }

        if (typeof landingPagePreference.randomize !== "boolean") {
          return res
            .status(400)
            .json({ error: "Landing page preference randomize must be a boolean" });
        }

        // Validate minimum pages for randomize mode
        if (landingPagePreference.randomize && landingPagePreference.pages.length < 2) {
          return res
            .status(400)
            .json({ error: "Random mode requires at least 2 pages selected" });
        }

        // Validate page keys
        const validPageKeys = [
          "home", "scenes", "performers", "studios", "tags", "collections",
          "galleries", "images", "playlists", "recommended", "watch-history", "user-stats"
        ];
        for (const pageKey of landingPagePreference.pages) {
          if (!validPageKeys.includes(pageKey)) {
            return res
              .status(400)
              .json({ error: `Invalid landing page key: ${pageKey}` });
          }
        }
      }
    }
```

Add to the Prisma update data object (around line 398):

```typescript
        ...(landingPagePreference !== undefined && { landingPagePreference }),
```

Add to the response settings object (around line 431):

```typescript
        landingPagePreference: updatedUser.landingPagePreference || { pages: ["home"], randomize: false },
```

Also add to the select in the update call (around line 414):

```typescript
        landingPagePreference: true,
```

**Step 3: Commit**

```bash
git add server/controllers/user.ts
git commit -m "feat(server): add landingPagePreference to user settings API (#290)"
```

---

### Task 4: Update Auth Login to Include Landing Preference

**Files:**
- Modify: `server/routes/auth.ts:15-59` (login endpoint)

**Step 1: Include landingPagePreference in login response**

Modify the login endpoint to select and return landingPagePreference. Change the select to include it (after line 25):

```typescript
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        landingPagePreference: true,
      },
    });
```

And update the response (around line 47):

```typescript
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        landingPagePreference: user.landingPagePreference || { pages: ["home"], randomize: false },
      },
    });
```

**Step 2: Commit**

```bash
git add server/routes/auth.ts
git commit -m "feat(server): include landingPagePreference in login response (#290)"
```

---

### Task 5: Update Login Component Navigation

**Files:**
- Modify: `client/src/components/pages/Login.jsx`

**Step 1: Import getLandingPage helper**

Add import at top of file:

```javascript
import { getLandingPage } from "../../constants/navigation.js";
```

**Step 2: Update handleSubmit to use landing page preference**

Modify the success handler (around line 25-33):

```javascript
      if (result.success) {
        // Check for saved redirect URL (takes priority over preference)
        const redirectUrl = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
        if (redirectUrl) {
          sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
          window.location.href = redirectUrl;
        } else {
          // Use landing page preference if available
          const destination = getLandingPage(result.user?.landingPagePreference);
          window.location.href = destination;
        }
      } else {
```

**Step 3: Update useAuth login call to return user data**

We need to modify how Login.jsx gets the user data. The `login` function from `useAuth` returns `{ success: true }` but we need access to the user data.

Looking at AuthContext.jsx, the login function sets `setUser(data.user)` but only returns `{ success: true }`. We need to return the user data as well.

Modify `client/src/contexts/AuthContext.jsx` login function (around line 43-49):

```javascript
    if (response.ok) {
      setIsAuthenticated(true);
      setUser(data.user);
      return { success: true, user: data.user };
    } else {
```

**Step 4: Commit**

```bash
git add client/src/components/pages/Login.jsx client/src/contexts/AuthContext.jsx
git commit -m "feat(client): use landing page preference for post-login navigation (#290)"
```

---

### Task 6: Create Landing Page Settings Component

**Files:**
- Create: `client/src/components/settings/LandingPageSettings.jsx`

**Step 1: Create the component**

```jsx
import { useState } from "react";
import { LANDING_PAGE_OPTIONS } from "../../constants/navigation.js";
import { Button, Switch } from "../ui/index.js";

/**
 * Landing page preference settings component
 * Allows users to configure which page to land on after login
 */
const LandingPageSettings = ({ landingPagePreference, onSave }) => {
  const [randomize, setRandomize] = useState(
    landingPagePreference?.randomize || false
  );
  const [selectedPages, setSelectedPages] = useState(
    landingPagePreference?.pages || ["home"]
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState("");

  const handleRandomizeToggle = (checked) => {
    setRandomize(checked);
    setHasChanges(true);
    setValidationError("");

    // If turning off randomize and multiple pages selected, keep only first
    if (!checked && selectedPages.length > 1) {
      setSelectedPages([selectedPages[0]]);
    }
  };

  const handlePageSelect = (pageKey) => {
    setHasChanges(true);
    setValidationError("");

    if (randomize) {
      // Multi-select mode
      if (selectedPages.includes(pageKey)) {
        // Don't allow deselecting if only 2 left (minimum for random)
        if (selectedPages.length <= 2) {
          setValidationError("Select at least 2 pages for random mode");
          return;
        }
        setSelectedPages(selectedPages.filter((p) => p !== pageKey));
      } else {
        setSelectedPages([...selectedPages, pageKey]);
      }
    } else {
      // Single-select mode (radio behavior)
      setSelectedPages([pageKey]);
    }
  };

  const handleSave = () => {
    // Validate
    if (randomize && selectedPages.length < 2) {
      setValidationError("Select at least 2 pages for random mode");
      return;
    }

    onSave({
      pages: selectedPages,
      randomize,
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    setRandomize(landingPagePreference?.randomize || false);
    setSelectedPages(landingPagePreference?.pages || ["home"]);
    setHasChanges(false);
    setValidationError("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Landing Page After Login
        </h3>
      </div>

      {/* Randomize toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={randomize}
          onChange={handleRandomizeToggle}
          id="randomize-toggle"
        />
        <label
          htmlFor="randomize-toggle"
          className="text-sm cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          Random one of selected pages
        </label>
      </div>

      {/* Page options */}
      <div className="space-y-2">
        {LANDING_PAGE_OPTIONS.map((option) => {
          const isSelected = selectedPages.includes(option.key);
          return (
            <label
              key={option.key}
              className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-opacity-50"
              style={{
                backgroundColor: isSelected
                  ? "var(--bg-hover)"
                  : "transparent",
              }}
            >
              <input
                type={randomize ? "checkbox" : "radio"}
                name="landing-page"
                checked={isSelected}
                onChange={() => handlePageSelect(option.key)}
                className="w-4 h-4"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <span style={{ color: "var(--text-primary)" }}>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Validation error */}
      {validationError && (
        <p className="text-sm" style={{ color: "var(--status-error)" }}>
          {validationError}
        </p>
      )}

      {/* Save/Reset buttons */}
      {hasChanges && (
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            Reset
          </Button>
        </div>
      )}
    </div>
  );
};

export default LandingPageSettings;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/LandingPageSettings.jsx
git commit -m "feat(client): add LandingPageSettings component (#290)"
```

---

### Task 7: Integrate Landing Page Settings into Navigation Tab

**Files:**
- Modify: `client/src/components/settings/tabs/NavigationTab.jsx`

**Step 1: Import LandingPageSettings**

Add import at top:

```javascript
import LandingPageSettings from "../LandingPageSettings.jsx";
```

**Step 2: Add state for landing page preference**

Add to state declarations (around line 16-17):

```javascript
  const [landingPagePreference, setLandingPagePreference] = useState(null);
```

**Step 3: Load landing page preference in useEffect**

In the loadSettings async function, add after navPreferences (around line 33):

```javascript
        setLandingPagePreference(
          settings.landingPagePreference || { pages: ["home"], randomize: false }
        );
```

**Step 4: Add save function**

Add after saveNavPreferences function (around line 71):

```javascript
  const saveLandingPagePreference = async (newPreference) => {
    try {
      await api.put("/user/settings", {
        landingPagePreference: newPreference,
      });

      setLandingPagePreference(newPreference);
      showSuccess("Landing page preference saved successfully!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save landing page preference");
    }
  };
```

**Step 5: Add LandingPageSettings component to render**

Add new section before Navigation Settings (around line 86):

```jsx
      {/* Landing Page Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <LandingPageSettings
          landingPagePreference={landingPagePreference}
          onSave={saveLandingPagePreference}
        />
      </div>
```

**Step 6: Commit**

```bash
git add client/src/components/settings/tabs/NavigationTab.jsx
git commit -m "feat(client): integrate LandingPageSettings into NavigationTab (#290)"
```

---

### Task 8: Manual Testing

**Step 1: Start the development servers**

```bash
# Terminal 1 - Server
cd server && npm run dev

# Terminal 2 - Client
cd client && npm run dev
```

**Step 2: Test default behavior**

1. Log out if logged in
2. Log in
3. Verify you land on Home (/)

**Step 3: Test single-select mode**

1. Go to Settings → User Preferences → Navigation
2. Find "Landing Page After Login" section
3. Select "Scenes"
4. Click Save
5. Log out and log in
6. Verify you land on /scenes

**Step 4: Test random mode**

1. Go to Settings → User Preferences → Navigation
2. Enable "Random one of selected pages"
3. Select at least 2 pages (e.g., Scenes, Performers, Studios)
4. Click Save
5. Log out and log in multiple times
6. Verify you land on different pages (statistically)

**Step 5: Test saved redirect URL priority**

1. While logged out, navigate to /performer/123 (or any protected route)
2. Get redirected to login
3. Log in
4. Verify you land on /performer/123 (not your landing preference)

**Step 6: Test validation**

1. Enable random mode
2. Try to deselect pages until only 1 is selected
3. Verify error message appears: "Select at least 2 pages for random mode"

---

### Task 9: Final Commit and Verification

**Step 1: Run linting**

```bash
cd client && npm run lint
cd ../server && npm run lint
```

Fix any lint errors if they appear.

**Step 2: Run tests (if any exist)**

```bash
cd client && npm test
cd ../server && npm test
```

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint/test issues for landing page preference (#290)"
```

**Step 4: Push branch**

```bash
git push -u origin 290-post-login-landing-page
```

---

## Summary

| Task | Description | Files Modified |
|------|-------------|----------------|
| 1 | Add database field | schema.prisma |
| 2 | Add constants | navigation.js |
| 3 | Update settings API | user.ts |
| 4 | Update auth login | auth.ts |
| 5 | Update Login component | Login.jsx, AuthContext.jsx |
| 6 | Create settings component | LandingPageSettings.jsx (new) |
| 7 | Integrate into NavigationTab | NavigationTab.jsx |
| 8 | Manual testing | - |
| 9 | Final verification | - |
