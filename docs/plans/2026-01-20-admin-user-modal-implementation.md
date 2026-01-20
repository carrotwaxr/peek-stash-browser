# Admin User Management Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace inline user action buttons with a comprehensive edit modal showing basic info, groups, permissions with inheritance labels, and account actions.

**Architecture:** Create a new UserEditModal component that consolidates user management into a single modal with sections for basic info (username/role), group memberships, permissions with inheritance visualization, and account actions (reset password, delete). The modal will use existing API endpoints for most operations and display permission inheritance sources from PermissionService.

**Tech Stack:** React, Lucide icons, existing Paper/Button UI components, existing API endpoints

---

## Design Reference

From the design document (`docs/plans/2026-01-20-v3.3-user-management-sharing-design.md:396-458`):

```
┌─────────────────────────────────────────────────┐
│ Edit User: username                         [X] │
├─────────────────────────────────────────────────┤
│                                                 │
│ Basic Info                                      │
│ ┌─────────────────────────────────────────────┐ │
│ │ Username: [username]                        │ │
│ │ Role: [Admin ▼]                             │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Groups                                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ [x] Family                                  │ │
│ │ [ ] Friends                                 │ │
│ │ [x] Close Friends                           │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Permissions                                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ Can share playlists                         │ │
│ │ [x] Enabled    Inherited from: Family       │ │
│ │                                             │ │
│ │ Can download files                          │ │
│ │ [ ] Disabled   Overridden (Group default:on)│ │
│ │                                             │ │
│ │ Can download playlists                      │ │
│ │ [x] Enabled    Inherited from: Close Friends│ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Account Actions                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ [Reset Password]  [Regenerate Recovery Key] │ │
│ │ [Disable Account]                           │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
├─────────────────────────────────────────────────┤
│                      [Cancel]  [Save Changes]   │
└─────────────────────────────────────────────────┘
```

---

### Task 1: Create UserEditModal Component Shell

**Files:**
- Create: `client/src/components/settings/UserEditModal.jsx`

**Step 1: Create basic modal structure**

Create the modal with all sections outlined but minimal functionality:

```jsx
import { useState, useEffect } from "react";
import { User, X, Shield, Users, Key, Trash2 } from "lucide-react";
import { Button, Paper } from "../ui/index.js";

/**
 * UserEditModal - Comprehensive user management modal
 *
 * @param {Object} props
 * @param {Object} props.user - User object to edit
 * @param {Array} props.groups - List of all groups
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Function} props.onSave - Callback when changes are saved
 * @param {Function} props.onMessage - Callback for success messages
 * @param {Function} props.onError - Callback for error messages
 * @param {Object} props.api - API instance for requests
 */
const UserEditModal = ({
  user,
  groups = [],
  onClose,
  onSave,
  onMessage,
  onError,
  api,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [role, setRole] = useState(user?.role || "USER");
  const [userGroups, setUserGroups] = useState([]);
  const [permissions, setPermissions] = useState(null);

  // Track what has changed for save
  const [hasChanges, setHasChanges] = useState(false);

  if (!user) return null;

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        return;
      }
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <Paper
        className="max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
              <Paper.Title>Edit User: {user.username}</Paper.Title>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-opacity-80 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </Paper.Header>

        <Paper.Body>
          <div className="space-y-6">
            {/* Error display */}
            {error && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "rgb(239, 68, 68)",
                }}
              >
                {error}
              </div>
            )}

            {/* Section 1: Basic Info */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <User size={16} />
                Basic Info
              </h3>
              <div
                className="p-4 rounded-lg space-y-4"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {/* Username (read-only) */}
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Username
                  </label>
                  <div
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {user.username}
                  </div>
                </div>

                {/* Role dropdown */}
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      setHasChanges(true);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Section 2: Groups - placeholder */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Users size={16} />
                Groups
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Groups section - to be implemented
                </p>
              </div>
            </section>

            {/* Section 3: Permissions - placeholder */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Shield size={16} />
                Permissions
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Permissions section - to be implemented
                </p>
              </div>
            </section>

            {/* Section 4: Account Actions - placeholder */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Key size={16} />
                Account Actions
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled>
                    Reset Password
                  </Button>
                  <Button variant="destructive" size="sm" disabled>
                    <Trash2 size={14} className="mr-1" />
                    Delete User
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </Paper.Body>

        {/* Footer with action buttons */}
        <div
          className="px-6 py-4 flex justify-end gap-3"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!hasChanges || loading}
            loading={loading}
          >
            Save Changes
          </Button>
        </div>
      </Paper>
    </div>
  );
};

export default UserEditModal;
```

**Step 2: Run linter to verify**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors for new file

**Step 3: Commit**

```bash
git add client/src/components/settings/UserEditModal.jsx
git commit -m "feat(user-modal): create UserEditModal shell with basic sections"
```

---

### Task 2: Wire Modal into UserManagementSection

**Files:**
- Modify: `client/src/components/settings/UserManagementSection.jsx`

**Step 1: Add import and state**

Add at top of file after other imports:
```jsx
import UserEditModal from "./UserEditModal.jsx";
```

Add state for edit modal user:
```jsx
const [editingUser, setEditingUser] = useState(null);
```

**Step 2: Add Edit button to user row**

Replace the current actions cell buttons with an Edit button that opens the modal. Find the actions `<td>` in the user table (around line 550) and add an Edit button at the start:

```jsx
<Button
  onClick={() => setEditingUser(user)}
  variant="secondary"
  size="sm"
  icon={<Edit2 size={14} />}
  className="px-3 py-1 text-sm whitespace-nowrap"
>
  Edit
</Button>
```

**Step 3: Add modal render**

Add after the GroupModal render (around line 672):

```jsx
{editingUser && (
  <UserEditModal
    user={editingUser}
    groups={groups}
    onClose={() => setEditingUser(null)}
    onSave={() => {
      setEditingUser(null);
      onMessage(`User "${editingUser.username}" updated successfully`);
      onUsersChanged();
      loadGroups();
    }}
    onMessage={onMessage}
    onError={onError}
    api={api}
  />
)}
```

**Step 4: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/components/settings/UserManagementSection.jsx
git commit -m "feat(user-modal): wire UserEditModal into UserManagementSection"
```

---

### Task 3: Implement Groups Section

**Files:**
- Modify: `client/src/components/settings/UserEditModal.jsx`

**Step 1: Load user's current group memberships**

Add useEffect to load user's groups on mount. First, add the API import at top:
```jsx
import { getUserGroupMemberships, addGroupMember, removeGroupMember } from "../../services/api.js";
```

Add loading effect after existing state declarations:
```jsx
// Load user's current group memberships
useEffect(() => {
  const loadUserGroups = async () => {
    try {
      const response = await getUserGroupMemberships(user.id);
      const memberGroupIds = (response.groups || []).map((g) => g.id);
      setUserGroups(memberGroupIds);
    } catch (err) {
      console.error("Failed to load user groups:", err);
    }
  };

  if (user?.id) {
    loadUserGroups();
  }
}, [user?.id]);
```

**Step 2: Implement group checkbox handler**

Add handler for toggling group membership:
```jsx
const handleGroupToggle = async (groupId, isCurrentlyMember) => {
  try {
    if (isCurrentlyMember) {
      await removeGroupMember(groupId, user.id);
      setUserGroups((prev) => prev.filter((id) => id !== groupId));
      onMessage?.(`Removed ${user.username} from group`);
    } else {
      await addGroupMember(groupId, user.id);
      setUserGroups((prev) => [...prev, groupId]);
      onMessage?.(`Added ${user.username} to group`);
    }
    // Mark that permissions may have changed
    setHasChanges(true);
  } catch (err) {
    setError(err.message || "Failed to update group membership");
  }
};
```

**Step 3: Replace Groups section placeholder**

Replace the Groups section with:
```jsx
{/* Section 2: Groups */}
<section>
  <h3
    className="text-sm font-medium mb-3 flex items-center gap-2"
    style={{ color: "var(--text-secondary)" }}
  >
    <Users size={16} />
    Groups
  </h3>
  <div
    className="p-4 rounded-lg"
    style={{
      backgroundColor: "var(--bg-secondary)",
      border: "1px solid var(--border-color)",
    }}
  >
    {groups.length === 0 ? (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No groups available. Create a group first to assign users.
      </p>
    ) : (
      <div className="space-y-2">
        {groups.map((group) => {
          const isMember = userGroups.includes(group.id);
          return (
            <label
              key={group.id}
              className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-opacity-50"
              style={{ backgroundColor: isMember ? "rgba(59, 130, 246, 0.05)" : "transparent" }}
            >
              <input
                type="checkbox"
                checked={isMember}
                onChange={() => handleGroupToggle(group.id, isMember)}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: "var(--primary-color)" }}
              />
              <div className="flex-1">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {group.name}
                </span>
                {group.description && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {group.description}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    )}
  </div>
</section>
```

**Step 4: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/components/settings/UserEditModal.jsx
git commit -m "feat(user-modal): implement Groups section with membership toggle"
```

---

### Task 4: Add getUserGroupMemberships API Function

**Files:**
- Modify: `client/src/services/api.js`

**Step 1: Add API function**

Find the groups API section (after `removeGroupMember`) and add:

```javascript
/**
 * Get group memberships for a specific user (admin only)
 * @param {number} userId - User ID
 * @returns {Promise<{groups: Array}>}
 */
export const getUserGroupMemberships = (userId) =>
  apiGet(`/user/${userId}/groups`);
```

**Step 2: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/services/api.js
git commit -m "feat(api): add getUserGroupMemberships function"
```

---

### Task 5: Add Backend Endpoint for User Group Memberships

**Files:**
- Modify: `server/controllers/user.ts`
- Modify: `server/routes/user.ts`

**Step 1: Add controller function**

Add to `server/controllers/user.ts` before the closing of the file:

```typescript
/**
 * Get user's group memberships (admin only)
 */
export const getUserGroupMemberships = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const memberships = await prisma.userGroupMembership.findMany({
      where: { userId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            canShare: true,
            canDownloadFiles: true,
            canDownloadPlaylists: true,
          },
        },
      },
    });

    res.json({
      groups: memberships.map((m) => m.group),
    });
  } catch (error) {
    console.error("Error getting user group memberships:", error);
    res.status(500).json({ error: "Failed to get user group memberships" });
  }
};
```

**Step 2: Add route**

Add to `server/routes/user.ts` after the permissions routes (around line 84):

```typescript
import { getUserGroupMemberships } from "../controllers/user.js";
```

Then add route:
```typescript
router.get(
  "/:userId/groups",
  requireAdmin,
  authenticated(getUserGroupMemberships)
);
```

**Step 3: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint -- --fix`
Expected: No errors

**Step 4: Commit**

```bash
git add server/controllers/user.ts server/routes/user.ts
git commit -m "feat(api): add endpoint for user group memberships"
```

---

### Task 6: Implement Permissions Section with Inheritance Display

**Files:**
- Modify: `client/src/components/settings/UserEditModal.jsx`

**Step 1: Load permissions on mount**

Add API import at top:
```jsx
import { getUserPermissions, updateUserPermissionOverrides } from "../../services/api.js";
```

Add permissions loading in the existing useEffect or create new one:
```jsx
// Load user's permissions
useEffect(() => {
  const loadPermissions = async () => {
    try {
      const response = await getUserPermissions(user.id);
      setPermissions(response.permissions);
    } catch (err) {
      console.error("Failed to load user permissions:", err);
    }
  };

  if (user?.id) {
    loadPermissions();
  }
}, [user?.id, userGroups]); // Re-fetch when groups change
```

**Step 2: Add permission override handler**

```jsx
const handlePermissionOverride = async (permissionKey, newValue) => {
  try {
    const overrideKey = `${permissionKey}Override`;
    const response = await updateUserPermissionOverrides(user.id, {
      [overrideKey]: newValue,
    });
    setPermissions(response.permissions);
    onMessage?.(`Permission updated for ${user.username}`);
    setHasChanges(true);
  } catch (err) {
    setError(err.message || "Failed to update permission");
  }
};
```

**Step 3: Add helper to render inheritance label**

```jsx
const renderInheritanceLabel = (source, currentValue) => {
  if (source === "override") {
    return (
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        Overridden (user-level)
      </span>
    );
  }
  if (source === "default") {
    return (
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        Default (no groups grant this)
      </span>
    );
  }
  return (
    <span className="text-xs" style={{ color: "rgb(59, 130, 246)" }}>
      Inherited from: {source}
    </span>
  );
};
```

**Step 4: Replace Permissions section placeholder**

```jsx
{/* Section 3: Permissions */}
<section>
  <h3
    className="text-sm font-medium mb-3 flex items-center gap-2"
    style={{ color: "var(--text-secondary)" }}
  >
    <Shield size={16} />
    Permissions
  </h3>
  <div
    className="p-4 rounded-lg space-y-4"
    style={{
      backgroundColor: "var(--bg-secondary)",
      border: "1px solid var(--border-color)",
    }}
  >
    {!permissions ? (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Loading permissions...
      </p>
    ) : (
      <>
        {/* Can Share */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Can share playlists
              </span>
            </div>
            {renderInheritanceLabel(permissions.sources.canShare, permissions.canShare)}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={
                permissions.sources.canShare === "override"
                  ? String(permissions.canShare)
                  : "inherit"
              }
              onChange={(e) => {
                const val = e.target.value;
                handlePermissionOverride(
                  "canShare",
                  val === "inherit" ? null : val === "true"
                );
              }}
              className="px-2 py-1 rounded text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="inherit">Inherit from groups</option>
              <option value="true">Force enabled</option>
              <option value="false">Force disabled</option>
            </select>
            <span
              className={`w-3 h-3 rounded-full ${permissions.canShare ? "bg-green-500" : "bg-gray-400"}`}
            />
          </div>
        </div>

        {/* Can Download Files */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Can download files
              </span>
            </div>
            {renderInheritanceLabel(permissions.sources.canDownloadFiles, permissions.canDownloadFiles)}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={
                permissions.sources.canDownloadFiles === "override"
                  ? String(permissions.canDownloadFiles)
                  : "inherit"
              }
              onChange={(e) => {
                const val = e.target.value;
                handlePermissionOverride(
                  "canDownloadFiles",
                  val === "inherit" ? null : val === "true"
                );
              }}
              className="px-2 py-1 rounded text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="inherit">Inherit from groups</option>
              <option value="true">Force enabled</option>
              <option value="false">Force disabled</option>
            </select>
            <span
              className={`w-3 h-3 rounded-full ${permissions.canDownloadFiles ? "bg-green-500" : "bg-gray-400"}`}
            />
          </div>
        </div>

        {/* Can Download Playlists */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Can download playlists
              </span>
            </div>
            {renderInheritanceLabel(permissions.sources.canDownloadPlaylists, permissions.canDownloadPlaylists)}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={
                permissions.sources.canDownloadPlaylists === "override"
                  ? String(permissions.canDownloadPlaylists)
                  : "inherit"
              }
              onChange={(e) => {
                const val = e.target.value;
                handlePermissionOverride(
                  "canDownloadPlaylists",
                  val === "inherit" ? null : val === "true"
                );
              }}
              className="px-2 py-1 rounded text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="inherit">Inherit from groups</option>
              <option value="true">Force enabled</option>
              <option value="false">Force disabled</option>
            </select>
            <span
              className={`w-3 h-3 rounded-full ${permissions.canDownloadPlaylists ? "bg-green-500" : "bg-gray-400"}`}
            />
          </div>
        </div>
      </>
    )}
  </div>
</section>
```

**Step 5: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 6: Commit**

```bash
git add client/src/components/settings/UserEditModal.jsx
git commit -m "feat(user-modal): implement Permissions section with inheritance display"
```

---

### Task 7: Implement Account Actions Section

**Files:**
- Modify: `client/src/components/settings/UserEditModal.jsx`

**Step 1: Add state for tracking current user**

Add prop for currentUser to know if editing self:
```jsx
const UserEditModal = ({
  user,
  groups = [],
  currentUser, // Add this prop
  onClose,
  onSave,
  onMessage,
  onError,
  api,
}) => {
```

Add check:
```jsx
const isCurrentUser = user?.id === currentUser?.id;
```

**Step 2: Implement role change handler**

```jsx
const handleRoleChange = async (newRole) => {
  if (isCurrentUser) {
    setError("You cannot change your own role");
    return;
  }

  try {
    await api.put(`/user/${user.id}/role`, { role: newRole });
    onMessage?.(`Role changed to ${newRole} for ${user.username}`);
    setHasChanges(true);
  } catch (err) {
    setError(err.response?.data?.error || "Failed to change role");
  }
};
```

Update role dropdown onChange to use this handler.

**Step 3: Implement delete user handler**

```jsx
const handleDeleteUser = async () => {
  if (isCurrentUser) {
    setError("You cannot delete your own account");
    return;
  }

  if (!confirm(`Are you sure you want to delete user "${user.username}"?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    setLoading(true);
    await api.delete(`/user/${user.id}`);
    onMessage?.(`User "${user.username}" deleted`);
    onClose();
    onSave?.();
  } catch (err) {
    setError(err.response?.data?.error || "Failed to delete user");
  } finally {
    setLoading(false);
  }
};
```

**Step 4: Replace Account Actions section**

```jsx
{/* Section 4: Account Actions */}
<section>
  <h3
    className="text-sm font-medium mb-3 flex items-center gap-2"
    style={{ color: "var(--text-secondary)" }}
  >
    <Key size={16} />
    Account Actions
  </h3>
  <div
    className="p-4 rounded-lg"
    style={{
      backgroundColor: "var(--bg-secondary)",
      border: "1px solid var(--border-color)",
    }}
  >
    {isCurrentUser ? (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        You cannot modify your own account from this modal. Use the account settings page instead.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled
          title="Coming in future release"
        >
          Reset Password
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeleteUser}
          disabled={loading}
        >
          <Trash2 size={14} className="mr-1" />
          Delete User
        </Button>
      </div>
    )}
  </div>
</section>
```

**Step 5: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 6: Commit**

```bash
git add client/src/components/settings/UserEditModal.jsx
git commit -m "feat(user-modal): implement Account Actions section with delete user"
```

---

### Task 8: Update UserManagementSection to Pass currentUser

**Files:**
- Modify: `client/src/components/settings/UserManagementSection.jsx`

**Step 1: Update modal props**

Update the UserEditModal render to pass currentUser:

```jsx
{editingUser && (
  <UserEditModal
    user={editingUser}
    groups={groups}
    currentUser={currentUser}
    onClose={() => setEditingUser(null)}
    onSave={() => {
      setEditingUser(null);
      onMessage(`User "${editingUser.username}" updated successfully`);
      onUsersChanged();
      loadGroups();
    }}
    onMessage={onMessage}
    onError={onError}
    api={api}
  />
)}
```

**Step 2: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/components/settings/UserManagementSection.jsx
git commit -m "feat(user-modal): pass currentUser to UserEditModal"
```

---

### Task 9: Write Tests for UserEditModal

**Files:**
- Create: `client/src/components/settings/UserEditModal.test.jsx`

**Step 1: Create test file**

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserEditModal from "./UserEditModal.jsx";

// Mock API functions
vi.mock("../../services/api.js", () => ({
  getUserGroupMemberships: vi.fn(),
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
  getUserPermissions: vi.fn(),
  updateUserPermissionOverrides: vi.fn(),
}));

import {
  getUserGroupMemberships,
  addGroupMember,
  removeGroupMember,
  getUserPermissions,
  updateUserPermissionOverrides,
} from "../../services/api.js";

describe("UserEditModal", () => {
  const mockUser = {
    id: 1,
    username: "testuser",
    role: "USER",
  };

  const mockCurrentUser = {
    id: 2,
    username: "admin",
    role: "ADMIN",
  };

  const mockGroups = [
    { id: 1, name: "Family", description: "Family members", canShare: true },
    { id: 2, name: "Friends", description: null, canDownloadFiles: true },
  ];

  const mockPermissions = {
    canShare: true,
    canDownloadFiles: false,
    canDownloadPlaylists: false,
    sources: {
      canShare: "Family",
      canDownloadFiles: "default",
      canDownloadPlaylists: "default",
    },
  };

  const mockApi = {
    put: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getUserGroupMemberships.mockResolvedValue({ groups: [{ id: 1 }] });
    getUserPermissions.mockResolvedValue({ permissions: mockPermissions });
  });

  it("renders user info correctly", async () => {
    render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={vi.fn()}
        onSave={vi.fn()}
        api={mockApi}
      />
    );

    expect(screen.getByText("Edit User: testuser")).toBeInTheDocument();
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("displays groups with correct membership state", async () => {
    render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={vi.fn()}
        onSave={vi.fn()}
        api={mockApi}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Family")).toBeInTheDocument();
      expect(screen.getByText("Friends")).toBeInTheDocument();
    });
  });

  it("shows inheritance label for permissions", async () => {
    render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={vi.fn()}
        onSave={vi.fn()}
        api={mockApi}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Inherited from: Family/)).toBeInTheDocument();
    });
  });

  it("disables delete for current user", async () => {
    render(
      <UserEditModal
        user={mockCurrentUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={vi.fn()}
        onSave={vi.fn()}
        api={mockApi}
      />
    );

    expect(
      screen.getByText(/cannot modify your own account/)
    ).toBeInTheDocument();
  });

  it("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn();
    render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={onClose}
        onSave={vi.fn()}
        api={mockApi}
      />
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles group membership", async () => {
    addGroupMember.mockResolvedValue({});

    render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onMessage={vi.fn()}
        api={mockApi}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Friends")).toBeInTheDocument();
    });

    // Find the Friends checkbox (unchecked initially since user is only in group 1)
    const checkboxes = screen.getAllByRole("checkbox");
    // Friends is the second group
    fireEvent.click(checkboxes[1]);

    await waitFor(() => {
      expect(addGroupMember).toHaveBeenCalledWith(2, 1);
    });
  });
});
```

**Step 2: Run tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- UserEditModal.test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add client/src/components/settings/UserEditModal.test.jsx
git commit -m "test(user-modal): add tests for UserEditModal"
```

---

### Task 10: Simplify User Table Actions

**Files:**
- Modify: `client/src/components/settings/UserManagementSection.jsx`

**Step 1: Remove redundant action buttons**

Now that the modal handles these actions, simplify the user row actions. Keep only the Edit button and the "Sync from Stash" button (which is a specialized action):

Replace the current actions cell content (around line 550-600) with:

```jsx
<td className="px-6 py-4 text-right">
  <div className="flex justify-end gap-2 flex-wrap">
    <Button
      onClick={() => openSyncModal(user)}
      variant="tertiary"
      size="sm"
      className="px-3 py-1 text-sm whitespace-nowrap"
    >
      Sync from Stash
    </Button>
    <Button
      onClick={() => setEditingUser(user)}
      variant="secondary"
      size="sm"
      icon={<Edit2 size={14} />}
      className="px-3 py-1 text-sm whitespace-nowrap"
    >
      Edit
    </Button>
  </div>
</td>
```

**Step 2: Remove unused functions**

Remove the following functions that are now handled by the modal:
- `deleteUser`
- `changeUserRole`

Also remove the "Content Restrictions" and "Groups" buttons since those features can be accessed from the Edit modal (or we can add them to the modal later).

**Step 3: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/components/settings/UserManagementSection.jsx
git commit -m "refactor(user-management): simplify user row actions, delegate to Edit modal"
```

---

### Task 11: Final Testing and Cleanup

**Files:**
- All modified files

**Step 1: Run full client lint**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint`
Expected: No errors

**Step 2: Run full server lint**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint`
Expected: No errors

**Step 3: Run client tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test`
Expected: All tests pass

**Step 4: Run server tests**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test`
Expected: All tests pass

**Step 5: Manual verification checklist**

- [ ] Open Settings → User Management
- [ ] Click Edit on a user → modal opens
- [ ] Basic Info section shows username (read-only) and role dropdown
- [ ] Groups section shows checkboxes for all groups
- [ ] Toggling a group checkbox updates membership immediately
- [ ] Permissions section shows inheritance labels (e.g., "Inherited from: Family")
- [ ] Changing permission override updates the display
- [ ] Delete User button works (with confirmation)
- [ ] Cannot delete yourself (shows message)
- [ ] Cancel button closes modal
- [ ] Clicking outside modal closes it (with unsaved changes warning if applicable)

**Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix(user-modal): final cleanup and fixes"
```

---

## Summary

This implementation creates a comprehensive User Edit Modal that consolidates user management into a single, well-organized interface. Key features:

1. **Basic Info**: Read-only username, editable role
2. **Groups**: Checkbox list with instant membership toggle
3. **Permissions**: Three-state selector (inherit/force on/force off) with inheritance source labels
4. **Account Actions**: Delete user (with confirmation)

The modal follows the design spec from the v3.3 planning document and uses existing API endpoints where possible, adding only one new endpoint (`GET /user/:userId/groups`) for fetching user group memberships.
