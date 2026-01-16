# Settings Page Reorganization Design

## Summary

Reorganize the Settings page to improve logical grouping of options and rename "User Settings" to "User Preferences".

## Changes

### 1. Rename User Settings to User Preferences

Update the section selector button and any references from "User Settings" to "User Preferences".

### 2. New Navigation Tab

Create a new top-level tab called "Navigation" containing:

- **Navigation Menu** section - nav item reordering and visibility toggles
- **Homepage Carousels** section - carousel reordering, visibility, and custom carousel management

These sections move from the Customization tab.

### 3. Consolidate View Preferences

Move Measurement Units into the View Preferences section within Customization. The View Preferences card will contain:

- Scene Card Preview Quality
- Wall View Preview Behavior
- Measurement Units

### 4. Reorder Server Settings Tabs

Change tab order from User Management → Server Configuration to Server Configuration → User Management.

## Final Structure

### User Preferences Tabs

| Tab | Sections |
|-----|----------|
| Theme | Built-in themes, Custom themes, UI Examples |
| Playback | Quality, mode, Chromecast, min play percent |
| Customization | View Preferences (incl. Measurement Units), Card Display Settings, Table Column Defaults |
| Content | Hidden items, hide confirmation |
| Account | Change password |
| Navigation | Navigation Menu, Homepage Carousels |

### Server Settings Tabs

1. Server Configuration
2. User Management

## Files to Modify

1. `client/src/components/pages/SettingsPage.jsx` - Update USER_TABS, SERVER_TABS arrays
2. `client/src/components/settings/SectionSelector.jsx` - Update button label
3. `client/src/components/settings/tabs/CustomizationTab.jsx` - Remove Navigation and Carousel sections, merge Measurement Units into View Preferences
4. `client/src/components/settings/tabs/NavigationTab.jsx` - New file

## URL Routes

New route: `/settings?section=user&tab=navigation`

All existing routes unchanged.

## No API Changes

All existing settings endpoints remain the same. This is a UI-only reorganization.
