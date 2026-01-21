# Recovery Key & Password Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add self-service password recovery via recovery keys, plus admin password reset functionality.

**Architecture:** Recovery keys are 28-character random strings stored plaintext in the database (for user viewing). Keys are auto-generated on login if missing. Users can view/regenerate their key in Settings > Account. Self-service recovery via `/forgot-password` page. Admins can reset passwords and regenerate keys from UserEditModal.

**Tech Stack:** React, Express, Prisma, bcryptjs, crypto (for key generation)

---

## Database Changes

Add to User model:
```prisma
model User {
  // ... existing fields

  // Recovery key for password reset (stored plaintext for user viewing)
  recoveryKey String?
}
```

---

## Task 1: Add recoveryKey field to User model

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add recoveryKey field**

Add after the permission override fields (around line 67):
```prisma
  // Recovery key for password reset (stored plaintext for user viewing)
  recoveryKey String?
```

**Step 2: Create migration**

Run: `cd /home/carrot/code/peek-stash-browser/server && npx prisma migrate dev --name add_recovery_key`

**Step 3: Commit**

```bash
git add server/prisma/
git commit -m "feat(db): add recoveryKey field to User model"
```

---

## Task 2: Add recovery key generation utility

**Files:**
- Create: `server/utils/recoveryKey.ts`

**Step 1: Create utility file**

```typescript
import crypto from "crypto";

/**
 * Generate a 28-character recovery key
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (without dashes in storage)
 * Uses uppercase alphanumeric, excluding similar chars (0/O, 1/I/L)
 */
export function generateRecoveryKey(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(28);
  let key = "";
  for (let i = 0; i < 28; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}

/**
 * Format recovery key for display (add dashes)
 */
export function formatRecoveryKey(key: string): string {
  return key.match(/.{1,4}/g)?.join("-") || key;
}

/**
 * Normalize recovery key for comparison (remove dashes, uppercase)
 */
export function normalizeRecoveryKey(key: string): string {
  return key.replace(/-/g, "").toUpperCase();
}
```

**Step 2: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint -- --fix`

**Step 3: Commit**

```bash
git add server/utils/recoveryKey.ts
git commit -m "feat(utils): add recovery key generation utility"
```

---

## Task 3: Generate recovery key on login

**Files:**
- Modify: `server/routes/auth.ts`

**Step 1: Import utility**

Add import at top:
```typescript
import { generateRecoveryKey } from "../utils/recoveryKey.js";
```

**Step 2: Generate key if missing**

In the login route, after successful password verification and before creating the token, add:

```typescript
// Generate recovery key if user doesn't have one
if (!user.recoveryKey) {
  const recoveryKey = generateRecoveryKey();
  await prisma.user.update({
    where: { id: user.id },
    data: { recoveryKey },
  });
  user.recoveryKey = recoveryKey;
}
```

**Step 3: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint -- --fix`

**Step 4: Commit**

```bash
git add server/routes/auth.ts
git commit -m "feat(auth): auto-generate recovery key on login"
```

---

## Task 4: Add forgot password API endpoints

**Files:**
- Modify: `server/routes/auth.ts`

**Step 1: Add init endpoint**

Add endpoint to check if user exists and has recovery key:

```typescript
// Forgot password - check username and get recovery method
router.post("/forgot-password/init", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, recoveryKey: true },
    });

    if (!user) {
      // Don't reveal if user exists
      return res.json({ hasRecoveryKey: false });
    }

    res.json({ hasRecoveryKey: !!user.recoveryKey });
  } catch (error) {
    console.error("Forgot password init error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
```

**Step 2: Add verify and reset endpoint**

```typescript
// Forgot password - verify recovery key and set new password
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { username, recoveryKey, newPassword } = req.body;

    if (!username || !recoveryKey || !newPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, recoveryKey: true },
    });

    if (!user || !user.recoveryKey) {
      return res.status(401).json({ error: "Invalid username or recovery key" });
    }

    // Normalize and compare recovery key
    const normalizedInput = recoveryKey.replace(/-/g, "").toUpperCase();
    if (normalizedInput !== user.recoveryKey) {
      return res.status(401).json({ error: "Invalid username or recovery key" });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Forgot password reset error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
```

**Step 3: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint -- --fix`

**Step 4: Commit**

```bash
git add server/routes/auth.ts
git commit -m "feat(auth): add forgot password API endpoints"
```

---

## Task 5: Add user recovery key endpoints

**Files:**
- Modify: `server/routes/user.ts`
- Modify: `server/controllers/user.ts`

**Step 1: Add getRecoveryKey controller**

In user.ts controller, add:

```typescript
/**
 * Get current user's recovery key (formatted for display)
 */
export const getRecoveryKey = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryKey: true },
    });

    if (!user?.recoveryKey) {
      return res.json({ recoveryKey: null });
    }

    // Format for display
    const formatted = user.recoveryKey.match(/.{1,4}/g)?.join("-") || user.recoveryKey;
    res.json({ recoveryKey: formatted });
  } catch (error) {
    console.error("Error getting recovery key:", error);
    res.status(500).json({ error: "Failed to get recovery key" });
  }
};
```

**Step 2: Add regenerateRecoveryKey controller**

```typescript
import { generateRecoveryKey } from "../utils/recoveryKey.js";

/**
 * Regenerate current user's recovery key
 */
export const regenerateRecoveryKey = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const newKey = generateRecoveryKey();
    await prisma.user.update({
      where: { id: userId },
      data: { recoveryKey: newKey },
    });

    // Format for display
    const formatted = newKey.match(/.{1,4}/g)?.join("-") || newKey;
    res.json({ recoveryKey: formatted });
  } catch (error) {
    console.error("Error regenerating recovery key:", error);
    res.status(500).json({ error: "Failed to regenerate recovery key" });
  }
};
```

**Step 3: Add routes**

In routes/user.ts, add after change-password route:

```typescript
import { getRecoveryKey, regenerateRecoveryKey } from "../controllers/user.js";

// Recovery key routes
router.get("/recovery-key", authenticated(getRecoveryKey));
router.post("/recovery-key/regenerate", authenticated(regenerateRecoveryKey));
```

**Step 4: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint -- --fix`

**Step 5: Commit**

```bash
git add server/controllers/user.ts server/routes/user.ts
git commit -m "feat(user): add recovery key view and regenerate endpoints"
```

---

## Task 6: Add admin password reset and recovery key regeneration

**Files:**
- Modify: `server/controllers/user.ts`
- Modify: `server/routes/user.ts`

**Step 1: Add adminResetPassword controller**

```typescript
/**
 * Admin: Reset a user's password
 */
export const adminResetPassword = async (
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

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};
```

**Step 2: Add adminRegenerateRecoveryKey controller**

```typescript
/**
 * Admin: Regenerate a user's recovery key
 */
export const adminRegenerateRecoveryKey = async (
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

    // Check user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const newKey = generateRecoveryKey();
    await prisma.user.update({
      where: { id: userId },
      data: { recoveryKey: newKey },
    });

    // Format for display
    const formatted = newKey.match(/.{1,4}/g)?.join("-") || newKey;
    res.json({ recoveryKey: formatted });
  } catch (error) {
    console.error("Error regenerating recovery key:", error);
    res.status(500).json({ error: "Failed to regenerate recovery key" });
  }
};
```

**Step 3: Add routes**

In routes/user.ts, add in admin section:

```typescript
import { adminResetPassword, adminRegenerateRecoveryKey } from "../controllers/user.js";

// Admin: reset user password
router.post(
  "/:userId/reset-password",
  requireAdmin,
  authenticated(adminResetPassword)
);

// Admin: regenerate user recovery key
router.post(
  "/:userId/regenerate-recovery-key",
  requireAdmin,
  authenticated(adminRegenerateRecoveryKey)
);
```

**Step 4: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run lint -- --fix`

**Step 5: Commit**

```bash
git add server/controllers/user.ts server/routes/user.ts
git commit -m "feat(admin): add password reset and recovery key regeneration"
```

---

## Task 7: Add API functions to client

**Files:**
- Modify: `client/src/services/api.js`

**Step 1: Add recovery key API functions**

Add in user section:

```javascript
/**
 * Get current user's recovery key
 * @returns {Promise<{recoveryKey: string | null}>}
 */
export const getRecoveryKey = () => apiGet("/user/recovery-key");

/**
 * Regenerate current user's recovery key
 * @returns {Promise<{recoveryKey: string}>}
 */
export const regenerateRecoveryKey = () => apiPost("/user/recovery-key/regenerate");

/**
 * Forgot password - check if user has recovery key
 * @param {string} username
 * @returns {Promise<{hasRecoveryKey: boolean}>}
 */
export const forgotPasswordInit = (username) =>
  apiPost("/auth/forgot-password/init", { username });

/**
 * Forgot password - reset with recovery key
 * @param {string} username
 * @param {string} recoveryKey
 * @param {string} newPassword
 * @returns {Promise<{success: boolean}>}
 */
export const forgotPasswordReset = (username, recoveryKey, newPassword) =>
  apiPost("/auth/forgot-password/reset", { username, recoveryKey, newPassword });

/**
 * Admin: Reset user's password
 * @param {number} userId
 * @param {string} newPassword
 * @returns {Promise<{success: boolean}>}
 */
export const adminResetPassword = (userId, newPassword) =>
  apiPost(`/user/${userId}/reset-password`, { newPassword });

/**
 * Admin: Regenerate user's recovery key
 * @param {number} userId
 * @returns {Promise<{recoveryKey: string}>}
 */
export const adminRegenerateRecoveryKey = (userId) =>
  apiPost(`/user/${userId}/regenerate-recovery-key`);
```

**Step 2: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`

**Step 3: Commit**

```bash
git add client/src/services/api.js
git commit -m "feat(api): add recovery key and password reset API functions"
```

---

## Task 8: Add Recovery Key section to AccountTab

**Files:**
- Modify: `client/src/components/settings/tabs/AccountTab.jsx`

**Step 1: Add state and effects**

Add imports and state:
```jsx
import { useState, useEffect } from "react";
import { Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import { getRecoveryKey, regenerateRecoveryKey } from "../../../services/api.js";

// Add state in component:
const [recoveryKey, setRecoveryKey] = useState(null);
const [showRecoveryKey, setShowRecoveryKey] = useState(false);
const [keyLoading, setKeyLoading] = useState(true);
const [regenerating, setRegenerating] = useState(false);
```

Add useEffect to load key:
```jsx
useEffect(() => {
  const loadRecoveryKey = async () => {
    try {
      const response = await getRecoveryKey();
      setRecoveryKey(response.recoveryKey);
    } catch (err) {
      console.error("Failed to load recovery key:", err);
    } finally {
      setKeyLoading(false);
    }
  };
  loadRecoveryKey();
}, []);
```

**Step 2: Add regenerate handler**

```jsx
const handleRegenerateKey = async () => {
  if (!confirm("Are you sure you want to regenerate your recovery key?\n\nYour old key will no longer work for password recovery.")) {
    return;
  }

  try {
    setRegenerating(true);
    const response = await regenerateRecoveryKey();
    setRecoveryKey(response.recoveryKey);
    setShowRecoveryKey(true);
    showSuccess("Recovery key regenerated");
  } catch (err) {
    showError("Failed to regenerate recovery key");
  } finally {
    setRegenerating(false);
  }
};

const copyToClipboard = () => {
  navigator.clipboard.writeText(recoveryKey);
  showSuccess("Recovery key copied to clipboard");
};
```

**Step 3: Add Recovery Key UI section**

Add after the Change Password section:
```jsx
{/* Recovery Key Section */}
<div
  className="p-6 rounded-lg border mt-6"
  style={{
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-color)",
  }}
>
  <h3
    className="text-lg font-semibold mb-2"
    style={{ color: "var(--text-primary)" }}
  >
    Recovery Key
  </h3>
  <p
    className="text-sm mb-4"
    style={{ color: "var(--text-muted)" }}
  >
    Use this key to reset your password if you forget it. Keep it somewhere safe.
  </p>

  {keyLoading ? (
    <p style={{ color: "var(--text-muted)" }}>Loading...</p>
  ) : recoveryKey ? (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="flex-1 px-4 py-3 rounded-lg font-mono text-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          {showRecoveryKey ? recoveryKey : "••••-••••-••••-••••-••••-••••-••••"}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowRecoveryKey(!showRecoveryKey)}
          title={showRecoveryKey ? "Hide key" : "Show key"}
        >
          {showRecoveryKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={copyToClipboard}
          disabled={!showRecoveryKey}
          title="Copy to clipboard"
        >
          <Copy size={16} />
        </Button>
      </div>
      <div className="flex justify-end">
        <Button
          variant="tertiary"
          size="sm"
          onClick={handleRegenerateKey}
          disabled={regenerating}
          loading={regenerating}
        >
          <RefreshCw size={14} className="mr-1" />
          Regenerate Key
        </Button>
      </div>
    </div>
  ) : (
    <p style={{ color: "var(--text-muted)" }}>
      No recovery key set. Log out and back in to generate one.
    </p>
  )}
</div>
```

**Step 4: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`

**Step 5: Commit**

```bash
git add client/src/components/settings/tabs/AccountTab.jsx
git commit -m "feat(account): add recovery key view and regenerate UI"
```

---

## Task 9: Create ForgotPasswordPage component

**Files:**
- Create: `client/src/components/pages/ForgotPasswordPage.jsx`

**Step 1: Create the page component**

```jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { forgotPasswordInit, forgotPasswordReset } from "../../services/api.js";
import { Button } from "../ui/index.js";

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: username, 2: recovery key + new password
  const [username, setUsername] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await forgotPasswordInit(username);
      if (response.hasRecoveryKey) {
        setStep(2);
      } else {
        setError("This account does not have a recovery key set. Please contact an administrator.");
      }
    } catch (err) {
      setError("Failed to check username. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await forgotPasswordReset(username, recoveryKey, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Invalid recovery key or username");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-full max-w-md p-8 rounded-lg" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
          <h1 className="text-2xl font-bold mb-4 text-center" style={{ color: "var(--text-primary)" }}>
            Password Reset Successful
          </h1>
          <p className="text-center mb-6" style={{ color: "var(--text-secondary)" }}>
            Your password has been reset. You can now log in with your new password.
          </p>
          <Button variant="primary" className="w-full" onClick={() => navigate("/login")}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="w-full max-w-md p-8 rounded-lg" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Forgot Password
        </h1>

        {error && (
          <div className="p-3 rounded-lg mb-4 text-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(239, 68, 68)" }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleUsernameSubmit}>
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                autoFocus
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading} loading={loading}>
              Continue
            </Button>
            <div className="mt-4 text-center">
              <Link to="/login" className="text-sm" style={{ color: "var(--text-muted)" }}>
                Back to Login
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit}>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Enter your recovery key and choose a new password.
            </p>
            <div className="mb-4">
              <label htmlFor="recoveryKey" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Recovery Key
              </label>
              <input
                type="text"
                id="recoveryKey"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                className="w-full px-4 py-2 rounded-lg font-mono"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                autoFocus
              />
            </div>
            <div className="mb-4">
              <label htmlFor="newPassword" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                minLength={6}
              />
            </div>
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading} loading={loading}>
              Reset Password
            </Button>
            <div className="mt-4 text-center">
              <button type="button" onClick={() => { setStep(1); setError(null); }} className="text-sm" style={{ color: "var(--text-muted)" }}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
```

**Step 2: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`

**Step 3: Commit**

```bash
git add client/src/components/pages/ForgotPasswordPage.jsx
git commit -m "feat(auth): create ForgotPasswordPage component"
```

---

## Task 10: Add forgot password route and login link

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/pages/Login.jsx`

**Step 1: Add route to App.jsx**

Import and add route:
```jsx
import ForgotPasswordPage from "./components/pages/ForgotPasswordPage.jsx";

// In routes, add before the catch-all:
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
```

**Step 2: Add link to Login page**

In Login.jsx, add link below the login button:
```jsx
<div className="mt-4 text-center">
  <Link to="/forgot-password" className="text-sm" style={{ color: "var(--text-muted)" }}>
    Forgot your password?
  </Link>
</div>
```

**Step 3: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`

**Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/pages/Login.jsx
git commit -m "feat(auth): add forgot password route and login link"
```

---

## Task 11: Add admin password reset to UserEditModal

**Files:**
- Modify: `client/src/components/settings/UserEditModal.jsx`

**Step 1: Add imports and state**

Add imports:
```jsx
import { adminResetPassword, adminRegenerateRecoveryKey } from "../../services/api.js";
```

Add state in UserEditModalContent:
```jsx
const [showPasswordReset, setShowPasswordReset] = useState(false);
const [newPassword, setNewPassword] = useState("");
const [generatedKey, setGeneratedKey] = useState(null);
```

**Step 2: Add password reset handler**

```jsx
const handleResetPassword = async () => {
  if (newPassword.length < 6) {
    setError("Password must be at least 6 characters");
    return;
  }

  try {
    setLoading(true);
    await adminResetPassword(user.id, newPassword);
    onMessage?.(`Password reset for ${user.username}`);
    setShowPasswordReset(false);
    setNewPassword("");
  } catch (err) {
    setError(err.response?.data?.error || "Failed to reset password");
  } finally {
    setLoading(false);
  }
};

const handleRegenerateRecoveryKey = async () => {
  if (!confirm(`Regenerate recovery key for "${user.username}"?\n\nTheir old key will no longer work.`)) {
    return;
  }

  try {
    setLoading(true);
    const response = await adminRegenerateRecoveryKey(user.id);
    setGeneratedKey(response.recoveryKey);
    onMessage?.(`Recovery key regenerated for ${user.username}`);
  } catch (err) {
    setError(err.response?.data?.error || "Failed to regenerate recovery key");
  } finally {
    setLoading(false);
  }
};
```

**Step 3: Update Account Actions section**

Replace the placeholder Reset Password button with working UI:
```jsx
{/* Account Actions */}
<section>
  {/* ... header ... */}
  <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
    {isCurrentUser ? (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        You cannot modify your own account from this modal. Use the account settings page instead.
      </p>
    ) : (
      <div className="space-y-4">
        {/* Password Reset */}
        {showPasswordReset ? (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 chars)"
              className="flex-1 px-3 py-2 rounded text-sm"
              style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
            />
            <Button variant="primary" size="sm" onClick={handleResetPassword} disabled={loading}>
              Set
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setShowPasswordReset(false); setNewPassword(""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowPasswordReset(true)}>
              Reset Password
            </Button>
            <Button variant="secondary" size="sm" onClick={handleRegenerateRecoveryKey} disabled={loading}>
              <Key size={14} className="mr-1" />
              Regenerate Recovery Key
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteUser} disabled={loading}>
              <Trash2 size={14} className="mr-1" />
              Delete User
            </Button>
          </div>
        )}

        {/* Show generated key */}
        {generatedKey && (
          <div className="p-3 rounded" style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>New recovery key (show to user):</p>
            <code className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{generatedKey}</code>
          </div>
        )}
      </div>
    )}
  </div>
</section>
```

**Step 4: Run linter**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm run lint -- --fix`

**Step 5: Commit**

```bash
git add client/src/components/settings/UserEditModal.jsx
git commit -m "feat(admin): add password reset and recovery key regeneration to UserEditModal"
```

---

## Task 12: Write tests

**Files:**
- Create: `server/tests/utils/recoveryKey.test.ts`
- Create: `client/tests/components/pages/ForgotPasswordPage.test.jsx`

**Step 1: Create server tests**

```typescript
import { describe, it, expect } from "vitest";
import { generateRecoveryKey, formatRecoveryKey, normalizeRecoveryKey } from "../../utils/recoveryKey.js";

describe("recoveryKey utils", () => {
  describe("generateRecoveryKey", () => {
    it("generates 28 character key", () => {
      const key = generateRecoveryKey();
      expect(key).toHaveLength(28);
    });

    it("uses only valid characters", () => {
      const key = generateRecoveryKey();
      const validChars = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
      expect(key).toMatch(validChars);
    });

    it("generates unique keys", () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateRecoveryKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe("formatRecoveryKey", () => {
    it("formats key with dashes", () => {
      const key = "ABCD1234EFGH5678IJKL9012MNOP";
      expect(formatRecoveryKey(key)).toBe("ABCD-1234-EFGH-5678-IJKL-9012-MNOP");
    });
  });

  describe("normalizeRecoveryKey", () => {
    it("removes dashes and uppercases", () => {
      const input = "abcd-1234-efgh-5678-ijkl-9012-mnop";
      expect(normalizeRecoveryKey(input)).toBe("ABCD1234EFGH5678IJKL9012MNOP");
    });
  });
});
```

**Step 2: Create client tests**

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

const mockForgotPasswordInit = vi.fn();
const mockForgotPasswordReset = vi.fn();

vi.mock("../../src/services/api.js", () => ({
  forgotPasswordInit: (...args) => mockForgotPasswordInit(...args),
  forgotPasswordReset: (...args) => mockForgotPasswordReset(...args),
}));

import ForgotPasswordPage from "../../src/components/pages/ForgotPasswordPage.jsx";

const renderPage = () => {
  return render(
    <BrowserRouter>
      <ForgotPasswordPage />
    </BrowserRouter>
  );
};

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders username form initially", () => {
    renderPage();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("shows error when user has no recovery key", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: false });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText(/does not have a recovery key/)).toBeInTheDocument();
    });
  });

  it("proceeds to step 2 when user has recovery key", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: true });
    renderPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Recovery Key")).toBeInTheDocument();
    });
  });

  it("shows success message after password reset", async () => {
    mockForgotPasswordInit.mockResolvedValue({ hasRecoveryKey: true });
    mockForgotPasswordReset.mockResolvedValue({ success: true });
    renderPage();

    // Step 1
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Recovery Key")).toBeInTheDocument();
    });

    // Step 2
    fireEvent.change(screen.getByLabelText("Recovery Key"), { target: { value: "ABCD-1234" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
      expect(screen.getByText("Password Reset Successful")).toBeInTheDocument();
    });
  });
});
```

**Step 3: Run tests**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test`
Run: `cd /home/carrot/code/peek-stash-browser/client && npm test`

**Step 4: Commit**

```bash
git add server/tests/ client/tests/
git commit -m "test: add tests for recovery key and forgot password"
```

---

## Task 13: Final testing and cleanup

**Step 1: Run all linters**

```bash
cd /home/carrot/code/peek-stash-browser/client && npm run lint
cd /home/carrot/code/peek-stash-browser/server && npm run lint
```

**Step 2: Run all tests**

```bash
cd /home/carrot/code/peek-stash-browser/client && npm test
cd /home/carrot/code/peek-stash-browser/server && npm test
```

**Step 3: Manual testing checklist**

- [ ] Log in as user without recovery key → key generated
- [ ] View recovery key in Settings > Account
- [ ] Copy recovery key
- [ ] Regenerate recovery key
- [ ] Log out, go to /forgot-password
- [ ] Enter username, see recovery key form
- [ ] Reset password with recovery key
- [ ] Log in with new password
- [ ] Admin: reset user password from UserEditModal
- [ ] Admin: regenerate user recovery key from UserEditModal

---

## Summary

This implementation provides:

1. **Auto-generated recovery keys** on login (if missing)
2. **Self-service password recovery** via `/forgot-password`
3. **User key management** in Settings > Account (view, copy, regenerate)
4. **Admin tools** in UserEditModal (reset password, regenerate recovery key)

Key decisions:
- Recovery keys stored plaintext (for user viewing)
- 28-char keys using unambiguous characters (no 0/O/1/I/L)
- Keys formatted with dashes for display (XXXX-XXXX-...)
- Regeneration invalidates old key immediately
