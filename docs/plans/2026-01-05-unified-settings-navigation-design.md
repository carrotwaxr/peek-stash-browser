# Unified Settings Navigation - Design Document

**Date:** 2026-01-05
**Version:** 3.2.0
**Status:** Approved

## Overview

Consolidate User Settings and Server Settings into a single Settings page with mobile-friendly sub-navigation, accessible to all users. This reorganization prepares for upcoming features like card anatomy customization and custom field display names.

---

## Motivation

### Current Problems
1. User Settings hidden in UserMenu dropdown (low discoverability)
2. Server Settings top-level for admins only (inconsistent access patterns)
3. Flat settings page structure doesn't scale for planned features
4. No clear organization for upcoming customization options

### Goals
1. Unified Settings entry point for all users
2. Scalable tab-based organization
3. Mobile-friendly navigation across all screen sizes
4. Maintain existing functionality during reorganization
5. Support future settings categories (card anatomy, field customization)

---

## Navigation Changes

### Settings Button Replacement

**Current State:**
- Admin-only "Server Settings" wrench icon in bottom navigation section
- Users access "My Settings" via UserMenu dropdown

**New State:**
- Universal "Settings" button (gear/cog icon) for all users
- Appears in same location as current Server Settings button
- Visible in all three layout versions

### Three Layout Implementations

#### 1. Mobile TopBar (< lg breakpoint)
- Settings item in hamburger menu
- Icon + "Settings" text
- Replaces admin-only Server Settings entry
- **File:** `client/src/components/ui/TopBar.jsx`

#### 2. Collapsed Sidebar (lg - xl breakpoint)
- Settings icon button with tooltip
- 64px wide sidebar section
- Icon only (gear/cog)
- **File:** `client/src/components/ui/Sidebar.jsx`

#### 3. Expanded Sidebar (xl+ breakpoint)
- Settings icon + "Settings" text
- 240px wide sidebar section
- Full button layout
- **File:** `client/src/components/ui/Sidebar.jsx`

---

## New Settings Page Structure

### Route: `/settings`

**URL Pattern:** `/settings?section={user|server}&tab={tabName}`

**Examples:**
- `/settings` → Defaults to User Settings, Theme tab
- `/settings?section=user&tab=playback` → User Settings, Playback tab
- `/settings?section=server&tab=user-management` → Server Settings, User Management tab (admin only)

### Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                                    │
│ Manage your preferences and server configuration           │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────┬───────────────────┐                       │
│ │ User Settings│ Server Settings   │  ← Top-level sections │
│ └──────┬───────┴───────────────────┘                       │
│        ▼                                                    │
│ ┌─────┬────────┬──────────────┬─────────┬─────────┐       │
│ │Theme│Playback│Customization │Content  │Account  │ ← Tabs│
│ └─────┴────────┴──────────────┴─────────┴─────────┘       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Active tab content appears here]                          │
│                                                             │
│ [Form fields, components, etc.]                            │
│                                                             │
│ [Save button if applicable]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Top-Level Sections

**User Settings** (visible to all users)
- 5 tabs: Theme, Playback, Customization, Content, Account

**Server Settings** (admin only)
- 2 tabs: User Management, Server Configuration
- Non-admins: Section not shown in UI
- Direct URL access blocked with redirect

### Sub-Navigation Pattern

**Horizontal Scrollable Tabs:**
- Desktop: Horizontal tabs below section selector
- Mobile: Horizontally scrollable with fade indicators
- Active tab auto-scrolls into view
- Smooth scroll behavior with touch support
- Material Design tab pattern (bottom border for active state)

---

## User Settings Tabs

### 1. Theme Tab

**Content:**
- Built-in Themes (selection grid)
- Custom Themes (Custom Theme Manager component)
- UI Examples (collapsible, existing functionality)

**Current Source:**
- Lines 206-237: Built-in theme selection
- Lines 941-945: Custom theme manager
- Maintains live theme preview functionality

**Data/API:**
- No separate save button (theme changes apply immediately)
- Custom themes have their own save/delete actions

---

### 2. Playback Tab

**Content:**
- Preferred Quality (auto, 1080p, 720p, 480p, 360p)
- Scene Card Preview Quality (sprite, webp, mp4)
- Preferred Playback Mode (auto, direct, transcode)
- Enable Chromecast/AirPlay (checkbox)
- Minimum Play Percent (0-100%, 5% increments)

**Current Source:**
- Lines 948-1172 from Settings.jsx
- Remove "Measurement Units" field (moved to Customization tab)

**Data/API:**
- Single save button at bottom
- PUT `/api/user/settings` with playback fields
- Form validation for percentage range

---

### 3. Customization Tab

**Content:**
- Navigation Settings (reorder/toggle nav items)
- Carousel Settings (reorder/toggle carousels)
- Measurement Units (metric/imperial dropdown)
- *(Future: Card anatomy visibility toggles)*
- *(Future: Custom field display names)*

**Current Source:**
- Lines 1186-1192: NavigationSettings component
- Lines 1176-1182: CarouselSettings component
- Lines 1128-1157: Measurement units dropdown

**Data/API:**
- Navigation: Separate save (triggers page reload)
- Carousel: Separate save
- Measurement units: Part of general settings save
- Each subsection has its own save button

---

### 4. Content Tab

**Content:**
- Hidden Items management
  - Link to `/hidden-items` page with count
  - "View Hidden Items" button
- Hide confirmation toggle
  - Checkbox: "Don't ask for confirmation when hiding items"

**Current Source:**
- Lines 1196-1234 from Settings.jsx
- Maintains link to dedicated hidden items page

**Data/API:**
- Hide confirmation toggle saves immediately via context
- No separate save button needed

---

### 5. Account Tab

**Content:**
- Change Password form
  - Current Password (required, type=password, min 6 chars)
  - New Password (required, type=password, min 6 chars)
  - Confirm New Password (required, type=password, min 6 chars)

**Current Source:**
- Lines 1237-1326 from Settings.jsx
- Client-side validation (passwords match, min length)

**Data/API:**
- Separate "Change Password" button
- POST `/api/user/change-password`
- Clears form on success
- Shows error/success toast

---

## Server Settings Tabs (Admin Only)

### 1. User Management Tab

**Content:**
- User list table (username, role, created date, actions)
- Create new user button/form
- Edit user modal/form
- Delete user confirmation
- Role management (admin/user)

**Current Source:**
- Wraps existing `UserManagementSection` component
- From ServerSettings.jsx line 109

**Data/API:**
- GET `/api/user/all` - Load users
- POST `/api/user/create` - Create user
- PUT `/api/user/:id` - Update user
- DELETE `/api/user/:id` - Delete user

**Permissions:**
- Admin only access
- Cannot delete self
- Cannot demote self if last admin

---

### 2. Server Configuration Tab

**Content:**
- Stash Instance configuration
  - URL, API key, connection test
- Server Statistics
  - Uptime, memory, database stats
- Version Information
  - Client version, server version, build info

**Current Source:**
- Wraps existing sections from ServerSettings.jsx:
  - Line 119: StashInstanceSection
  - Line 122: ServerStatsSection
  - Line 125: VersionInfoSection

**Data/API:**
- Various endpoints for each subsection
- Each subsection has its own save/update logic

---

## URL Redirects

### Legacy Routes → New Routes

| Old Route          | New Route                                   | Method        |
|--------------------|---------------------------------------------|---------------|
| `/my-settings`     | `/settings?section=user&tab=theme`          | Replace       |
| `/server-settings` | `/settings?section=server&tab=user-management` | Replace    |

**Implementation:**
- Add `<Route>` redirects in App.jsx using `<Navigate replace />`
- Preserves browser history (back button works)
- Handles existing bookmarks
- Old routes eventually removed after deprecation period

---

## UserMenu Changes

**Remove from UserMenu dropdown:**
- "My Settings" link (lines 122-138 in UserMenu.jsx)

**Keep in UserMenu:**
- Watch History
- TV Mode toggle
- Sign Out

**Rationale:**
- Settings now top-level navigation item
- Reduces UserMenu clutter
- Consistent with Settings visibility for all users

---

## Mobile Behavior

### Tab Scrolling Mechanics

**CSS Implementation:**
```css
.settings-tabs {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scrollbar-width: none; /* Firefox */
}

.settings-tabs::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}
```

**Visual Indicators:**
- Gradient fade on left edge (when scrolled right)
- Gradient fade on right edge (when scrolled left)
- JavaScript detection of scroll position
- Active tab scrolls into view on mount/change

### Responsive Breakpoints

| Breakpoint | Width     | Behavior                               |
|------------|-----------|----------------------------------------|
| Mobile     | < 768px   | Full vertical stacking, scrollable tabs |
| Tablet     | 768-1024px| Horizontal layout, may scroll tabs     |
| Desktop    | 1024px+   | Full horizontal, tabs rarely scroll    |

---

## Component Architecture

### New Components

#### `SettingsPage.jsx`
**Location:** `client/src/components/pages/SettingsPage.jsx`

**Responsibilities:**
- Main settings page component
- Parse URL parameters (section, tab)
- Manage section/tab state
- Render SectionSelector and SettingsLayout
- Handle role-based access (admin check for server section)
- Redirect non-admins from server section

**Props:** None (uses URL params and auth context)

**State:**
- `activeSection`: 'user' | 'server'
- `activeTab`: string (tab identifier)

---

#### `SettingsLayout.jsx`
**Location:** `client/src/components/settings/SettingsLayout.jsx`

**Responsibilities:**
- Reusable layout wrapper for settings tabs
- Horizontal tab navigation rendering
- Mobile scroll behavior
- URL parameter updates on tab change
- Active tab detection and styling

**Props:**
```javascript
{
  tabs: Array<{ id: string, label: string, icon?: string }>,
  activeTab: string,
  onTabChange: (tabId: string) => void,
  children: ReactNode
}
```

---

#### `SectionSelector.jsx`
**Location:** `client/src/components/settings/SectionSelector.jsx`

**Responsibilities:**
- Top-level User/Server section switcher
- Segmented control style (two-button toggle)
- Shows Server option only for admins
- Updates URL parameter on change

**Props:**
```javascript
{
  activeSection: 'user' | 'server',
  onSectionChange: (section: string) => void,
  isAdmin: boolean
}
```

---

#### Tab Content Components

| Component                | Location                                    | Wraps/Reuses              |
|--------------------------|---------------------------------------------|---------------------------|
| `ThemeTab.jsx`           | `components/settings/tabs/ThemeTab.jsx`     | Existing theme UI         |
| `PlaybackTab.jsx`        | `components/settings/tabs/PlaybackTab.jsx`  | Existing playback form    |
| `CustomizationTab.jsx`   | `components/settings/tabs/CustomizationTab.jsx` | Nav/Carousel/Units   |
| `ContentTab.jsx`         | `components/settings/tabs/ContentTab.jsx`   | Hidden items section      |
| `AccountTab.jsx`         | `components/settings/tabs/AccountTab.jsx`   | Password change form      |
| `UserManagementTab.jsx`  | `components/settings/tabs/UserManagementTab.jsx` | UserManagementSection |
| `ServerConfigTab.jsx`    | `components/settings/tabs/ServerConfigTab.jsx` | Multiple sections      |

**Pattern:**
- Each tab is a self-contained component
- Manages its own form state
- Handles its own API calls
- Shows loading/error states
- Displays success/error toasts

---

### Modified Components

#### `Sidebar.jsx`
**Changes:**
- Line ~280-309: Server Settings section
- Replace `user.role === "ADMIN"` check with universal Settings button
- Change icon from "wrench" to "settings"
- Update link from `/server-settings` to `/settings`
- Update aria-label and tooltip to "Settings"

#### `TopBar.jsx`
**Changes:**
- Line ~159-180: Server Settings in hamburger menu
- Replace admin-only conditional with universal Settings
- Update link from `/server-settings` to `/settings`
- Change icon from "wrench" to "settings"
- Update display text to "Settings"

#### `UserMenu.jsx`
**Changes:**
- Remove lines 122-138: "My Settings" link
- Keep Watch History, TV Mode, Sign Out
- Adjust spacing/styling if needed

#### `App.jsx`
**Changes:**
- Add `/settings` route with SettingsPage component
- Add redirect routes for `/my-settings` and `/server-settings`
- Remove old routes after deprecation period

---

## State Management

### URL Parameters

**Schema:**
```javascript
{
  section: 'user' | 'server',  // Default: 'user'
  tab: string                   // Default: first tab of section
}
```

**Default Tabs:**
- User section: 'theme'
- Server section: 'user-management'

### URL Update Logic

**On Tab Change:**
```javascript
const handleTabChange = (newTab) => {
  const params = new URLSearchParams(location.search);
  params.set('tab', newTab);
  navigate(`/settings?${params.toString()}`, { replace: true });
};
```

**On Section Change:**
```javascript
const handleSectionChange = (newSection) => {
  const defaultTab = newSection === 'user' ? 'theme' : 'user-management';
  navigate(`/settings?section=${newSection}&tab=${defaultTab}`, { replace: true });
};
```

### Default Behavior

| Scenario                                    | Behavior                                |
|---------------------------------------------|-----------------------------------------|
| Landing on `/settings`                      | User Settings, Theme tab                |
| Admin landing on `/settings`                | User Settings, Theme tab                |
| Non-admin accessing `?section=server`       | Redirect to User Settings, Theme tab    |
| Invalid tab name                            | Default to first tab of section         |
| Back/forward navigation                     | Respects URL params                     |
| Refresh                                     | Maintains current section/tab           |

### Tab Persistence

- URL updates when switching tabs (no page reload)
- Browser back/forward navigation works
- Shareable links to specific tabs
- Refresh maintains current tab
- Deep linking supported

---

## Visual Design

### Section Selector (User/Server)

**Style:** Segmented control

```
┌────────────────┬───────────────────┐
│ User Settings  │ Server Settings   │
│   (selected)   │   (unselected)    │
└────────────────┴───────────────────┘
```

**Specifications:**
- Two buttons side-by-side
- Active button: `background: var(--accent-primary)`, `color: white`
- Inactive button: `background: var(--bg-secondary)`, `color: var(--text-primary)`
- Border radius: `0.5rem`
- Height: `2.5rem` (40px)
- Transition: `all 0.2s ease`
- Mobile: Full width, centered
- Desktop: Max-width 400px, centered

---

### Tab Navigation

**Style:** Horizontal scrollable tabs (Material Design pattern)

```
┌─────┬─────────┬──────────────┬─────────┬─────────┐
│Theme│Playback │Customization │Content  │Account  │
└──┬──┴─────────┴──────────────┴─────────┴─────────┘
   └─ Active indicator (accent color bottom border)
```

**Specifications:**
- Active tab:
  - Bottom border: `3px solid var(--accent-primary)`
  - Font weight: `600`
  - Color: `var(--accent-primary)`
- Inactive tabs:
  - No bottom border
  - Font weight: `500`
  - Color: `var(--text-secondary)`
  - Hover: `background: var(--bg-secondary)`
- Tab spacing: `1rem` gap between tabs
- Font size: `14px`
- Padding: `0.75rem 1rem`
- Minimum tap target: `44px` height (mobile)

---

### Tab Content Area

**Style:** Paper component pattern

```
┌─────────────────────────────────────┐
│                                     │
│  [Tab content rendered here]        │
│                                     │
│  [Forms, settings, etc.]            │
│                                     │
│                 ┌──────────────┐    │
│                 │ Save Button  │    │
│                 └──────────────┘    │
└─────────────────────────────────────┘
```

**Specifications:**
- Background: `var(--bg-card)`
- Border: `1px solid var(--border-color)`
- Border radius: `0.5rem`
- Padding: `1.5rem`
- Shadow: `var(--shadow-md)`
- Min height: `400px`

---

### Mobile Scroll Indicators

**Left/Right Fade Gradients:**
```css
.tab-scroll-container {
  position: relative;
}

.tab-scroll-container::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2rem;
  background: linear-gradient(to right, var(--bg-secondary), transparent);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.tab-scroll-container.scrolled-right::before {
  opacity: 1;
}
```

---

## Accessibility

### Keyboard Navigation

**Tab Navigation:**
- `Tab` key: Navigate through section selector, tabs, and form fields
- `Enter`/`Space`: Activate selected tab
- `Arrow Left`/`Right`: Move between tabs when tab list is focused
- Focus indicators: Visible outline on all interactive elements

**Focus Order:**
1. Section selector (if admin)
2. Tab navigation
3. Tab content (forms, buttons)

---

### ARIA Attributes

**Tab List:**
```html
<div role="tablist" aria-label="Settings sections">
  <button
    role="tab"
    aria-selected="true"
    aria-controls="theme-panel"
    id="theme-tab"
  >
    Theme
  </button>
  <!-- ... more tabs ... -->
</div>
```

**Tab Panel:**
```html
<div
  role="tabpanel"
  id="theme-panel"
  aria-labelledby="theme-tab"
>
  <!-- Tab content -->
</div>
```

**Section Selector:**
```html
<div role="radiogroup" aria-label="Settings section">
  <button role="radio" aria-checked="true">User Settings</button>
  <button role="radio" aria-checked="false">Server Settings</button>
</div>
```

---

### Screen Reader Announcements

**On Tab Change:**
- Announce: "Theme tab selected" (or current tab name)
- Tab panel content becomes focus target

**On Section Change:**
- Announce: "User Settings section selected"
- First tab in section announced

**Form Validation:**
- Error messages associated with inputs via `aria-describedby`
- Error summary at top of form if multiple errors
- Success/error toasts announced as alerts

---

## Implementation Phases

### Phase 1: Core Structure
**Goal:** Create foundational components and routing

**Tasks:**
1. Create `SettingsPage.jsx` with URL parameter handling
2. Create `SettingsLayout.jsx` with tab navigation
3. Create `SectionSelector.jsx` component
4. Add `/settings` route to App.jsx
5. Implement horizontal scrollable tabs with mobile support
6. Add URL parameter state management

**Validation:**
- `/settings` route renders
- URL parameters control section/tab
- Tab navigation works
- Mobile scrolling works

---

### Phase 2: User Settings Migration
**Goal:** Migrate all User Settings tabs

**Tasks:**
1. Create `ThemeTab.jsx` - Move theme selection UI
2. Create `PlaybackTab.jsx` - Move playback form (remove units)
3. Create `CustomizationTab.jsx` - Combine nav/carousel/units
4. Create `ContentTab.jsx` - Move hidden items section
5. Create `AccountTab.jsx` - Move password change form
6. Test each tab's save functionality
7. Verify all API calls work correctly

**Validation:**
- All tabs render correctly
- Forms submit and save data
- Validation works
- Toasts show on success/error

---

### Phase 3: Server Settings Migration
**Goal:** Migrate Server Settings with admin permissions

**Tasks:**
1. Create `UserManagementTab.jsx` wrapping existing section
2. Create `ServerConfigTab.jsx` wrapping existing sections
3. Implement admin-only section visibility
4. Add redirect for non-admin accessing server section
5. Test all server settings functionality

**Validation:**
- Admin sees both sections
- Non-admin only sees User Settings
- Non-admin redirected from `?section=server`
- All server settings work

---

### Phase 4: Navigation Updates
**Goal:** Update all navigation components

**Tasks:**
1. Update `Sidebar.jsx` - Replace Server Settings with universal Settings
   - Icon-only collapsed view (lg-xl)
   - Icon+text expanded view (xl+)
2. Update `TopBar.jsx` - Replace Server Settings in hamburger menu
3. Update `UserMenu.jsx` - Remove "My Settings" link
4. Test Settings button in all three layout versions
5. Verify TV mode keyboard navigation still works

**Validation:**
- Settings button shows for all users
- All three layouts work (mobile, collapsed, expanded)
- Button navigates to `/settings`
- UserMenu no longer has My Settings

---

### Phase 5: Redirects & Cleanup
**Goal:** Handle legacy routes and cleanup

**Tasks:**
1. Add redirects in App.jsx:
   - `/my-settings` → `/settings?section=user&tab=theme`
   - `/server-settings` → `/settings?section=server&tab=user-management`
2. Remove old `Settings.jsx` and `ServerSettings.jsx` pages
3. Update any internal links pointing to old routes
4. Test bookmark compatibility
5. Update documentation

**Validation:**
- Old URLs redirect correctly
- Browser history works with redirects
- No broken internal links
- Bookmarks redirect properly

---

## Testing Checklist

### Navigation
- [ ] Settings button appears in collapsed sidebar (lg-xl)
- [ ] Settings button appears in expanded sidebar (xl+)
- [ ] Settings button appears in mobile hamburger menu
- [ ] Settings button works for admin users
- [ ] Settings button works for non-admin users
- [ ] Settings button navigates to `/settings`
- [ ] UserMenu no longer shows "My Settings" link

### URL & Routing
- [ ] `/settings` defaults to User Settings, Theme tab
- [ ] URL parameters correctly control section/tab
- [ ] Back/forward browser navigation works
- [ ] Refresh maintains current section/tab
- [ ] `/my-settings` redirects to new route
- [ ] `/server-settings` redirects to new route
- [ ] Invalid tab names default gracefully
- [ ] Deep linking to specific tabs works

### Permissions
- [ ] Admin sees User Settings section
- [ ] Admin sees Server Settings section
- [ ] Non-admin sees User Settings section only
- [ ] Non-admin does NOT see Server Settings selector
- [ ] Non-admin accessing `?section=server` via URL is redirected
- [ ] All permission checks use `user.role === "ADMIN"`

### User Settings - Theme Tab
- [ ] Built-in themes display correctly
- [ ] Theme selection applies immediately
- [ ] Custom Theme Manager renders
- [ ] Custom theme create/edit/delete works
- [ ] UI Examples expand/collapse works

### User Settings - Playback Tab
- [ ] All form fields render
- [ ] Form validation works
- [ ] Save button submits data
- [ ] API call succeeds
- [ ] Success toast shows
- [ ] Error toast shows on failure
- [ ] Measurement Units NOT in this tab

### User Settings - Customization Tab
- [ ] Navigation Settings component renders
- [ ] Carousel Settings component renders
- [ ] Measurement Units dropdown renders
- [ ] Navigation save triggers page reload
- [ ] Carousel save shows success
- [ ] Units save works correctly

### User Settings - Content Tab
- [ ] Hidden items link appears
- [ ] Link navigates to `/hidden-items`
- [ ] Hide confirmation toggle renders
- [ ] Toggle saves immediately

### User Settings - Account Tab
- [ ] Password form renders
- [ ] Current password validation works
- [ ] New password min length validation works
- [ ] Confirm password match validation works
- [ ] Change password API call succeeds
- [ ] Form clears on success
- [ ] Error shows on failure

### Server Settings - User Management Tab (Admin)
- [ ] User list displays
- [ ] Create user form works
- [ ] Edit user works
- [ ] Delete user works
- [ ] Role management works
- [ ] Cannot delete self
- [ ] Cannot demote self if last admin

### Server Settings - Server Config Tab (Admin)
- [ ] Stash instance section renders
- [ ] Server stats section renders
- [ ] Version info section renders
- [ ] All subsection functionality works

### Mobile Behavior
- [ ] Tab navigation scrolls horizontally on small screens
- [ ] Active tab scrolls into view on mount
- [ ] Touch scrolling works smoothly
- [ ] Scroll indicators (fades) appear when needed
- [ ] Tab content is readable on mobile
- [ ] Forms are usable on mobile

### Accessibility
- [ ] Tab key navigates through sections and tabs
- [ ] Enter/Space activates tabs
- [ ] Arrow keys move between tabs
- [ ] Focus indicators visible
- [ ] ARIA labels present on tab elements
- [ ] Screen reader announces tab changes
- [ ] Form errors announced to screen readers
- [ ] Keyboard navigation works without mouse

### Visual Design
- [ ] Section selector styled correctly
- [ ] Active section has accent background
- [ ] Tab navigation uses bottom border for active state
- [ ] Tabs have proper spacing and sizing
- [ ] Tab content area has proper padding/shadow
- [ ] Matches existing Paper component style
- [ ] Responsive at all breakpoints

### Performance
- [ ] No unnecessary re-renders
- [ ] Tab switching is instant
- [ ] Form data persists when switching tabs
- [ ] Large lists (users) render efficiently

---

## Risks & Mitigation

### Risk: Breaking existing settings functionality
**Mitigation:**
- Migrate components incrementally
- Maintain existing API contracts
- Test each tab thoroughly before moving to next
- Keep old routes as redirects initially

### Risk: Mobile tab scrolling doesn't work on all devices
**Mitigation:**
- Test on iOS Safari, Chrome Android, Firefox Mobile
- Use standard overflow-x: auto with -webkit-overflow-scrolling: touch
- Provide fallback for browsers without smooth scrolling

### Risk: Admin users confused by moved Server Settings
**Mitigation:**
- Add redirect from `/server-settings`
- Server Settings section prominently visible for admins
- Consider adding a "What's New" announcement or tooltip

### Risk: URL complexity confuses users
**Mitigation:**
- Make URLs optional (defaults work)
- Keep URL structure simple and readable
- Document URL parameters for support

---

## Future Enhancements

### Card Anatomy Customization (v3.3+)
- Add new tab or section under Customization
- Toggles for showing/hiding card elements (O-counter, play count, description, etc.)
- Per-user preferences stored in user settings

### Custom Field Display Names (v3.3+)
- Add new tab or section under Customization
- Rename field labels (e.g., "O-Counter" → "Rating")
- Per-user preferences

### Settings Search (v3.4+)
- Add search bar at top of settings page
- Filter tabs/sections by keyword
- Jump to relevant setting

### Settings Import/Export (v3.4+)
- Export user settings as JSON
- Import settings from file
- Useful for backup or sharing configurations

---

## References

### Design Patterns
- Material Design Tabs: https://m3.material.io/components/tabs
- Horizontal scrolling: https://ishadeed.com/article/horizontal-scrolling/
- Segmented controls: https://developer.apple.com/design/human-interface-guidelines/segmented-controls

### Current Code References
- `client/src/components/pages/Settings.jsx` - Current User Settings
- `client/src/components/pages/ServerSettings.jsx` - Current Server Settings
- `client/src/components/ui/Sidebar.jsx` - Sidebar navigation
- `client/src/components/ui/TopBar.jsx` - Mobile top bar
- `client/src/components/ui/UserMenu.jsx` - User menu dropdown

### API Endpoints
- `GET /api/user/settings` - Load user settings
- `PUT /api/user/settings` - Save user settings
- `POST /api/user/change-password` - Change password
- `GET /api/user/all` - Load all users (admin)
- `POST /api/user/create` - Create user (admin)
- `PUT /api/user/:id` - Update user (admin)
- `DELETE /api/user/:id` - Delete user (admin)

---

## Appendix: Component File Structure

```
client/src/
├── components/
│   ├── pages/
│   │   ├── SettingsPage.jsx              [NEW]
│   │   ├── Settings.jsx                  [DELETE after migration]
│   │   └── ServerSettings.jsx            [DELETE after migration]
│   ├── settings/
│   │   ├── SettingsLayout.jsx            [NEW]
│   │   ├── SectionSelector.jsx           [NEW]
│   │   ├── tabs/
│   │   │   ├── ThemeTab.jsx              [NEW]
│   │   │   ├── PlaybackTab.jsx           [NEW]
│   │   │   ├── CustomizationTab.jsx      [NEW]
│   │   │   ├── ContentTab.jsx            [NEW]
│   │   │   ├── AccountTab.jsx            [NEW]
│   │   │   ├── UserManagementTab.jsx     [NEW]
│   │   │   └── ServerConfigTab.jsx       [NEW]
│   │   ├── CarouselSettings.jsx          [EXISTING - reused]
│   │   ├── NavigationSettings.jsx        [EXISTING - reused]
│   │   ├── CustomThemeManager.jsx        [EXISTING - reused]
│   │   ├── UserManagementSection.jsx     [EXISTING - reused]
│   │   ├── StashInstanceSection.jsx      [EXISTING - reused]
│   │   ├── ServerStatsSection.jsx        [EXISTING - reused]
│   │   └── VersionInfoSection.jsx        [EXISTING - reused]
│   └── ui/
│       ├── Sidebar.jsx                    [MODIFIED]
│       ├── TopBar.jsx                     [MODIFIED]
│       └── UserMenu.jsx                   [MODIFIED]
└── App.jsx                                [MODIFIED]
```

---

**End of Design Document**
