# Security Audit: Unauthenticated API Routes

**Date:** 2026-01-04
**Auditor:** Claude (automated)
**Scope:** All API routes that do not require authentication

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Medium | 1 |
| Low | 0 |
| Info | 3 |

## Critical Issues

### 1. `/api/auth/first-time-password` - Unauthenticated Admin Password Reset

**File:** `server/routes/auth.ts:91-131`

**Issue:** This endpoint allows anyone to change the admin user's password without authentication. There is no guard checking whether this is actually the first-time setup.

```typescript
// Only allow changing admin password during initial setup
if (username !== "admin") {
  return res.status(403).json({ error: "..." });
}
```

The comment says "during initial setup" but there's no check for initial setup state. An attacker can call this endpoint at any time to reset the admin password.

**Attack Scenario:**
1. User sets up Peek with admin password
2. Attacker calls `POST /api/auth/first-time-password` with `{"username": "admin", "newPassword": "hacked"}`
3. Admin password is now "hacked"
4. Attacker logs in as admin

**Recommendation:** Add a guard that checks `setupComplete === false` before allowing password changes, similar to `createFirstAdmin`:

```typescript
const userCount = await prisma.user.count();
const stashCount = await prisma.stashInstance.count();
const setupComplete = userCount > 0 && stashCount > 0;

if (setupComplete) {
  return res.status(403).json({
    error: "First-time setup is complete. Use account settings to change password."
  });
}
```

---

## Medium Issues

### 2. `/api/proxy/stash?path=...` - Open Proxy with Path Traversal Risk

**File:** `server/controllers/proxy.ts:261-349`

**Issue:** This endpoint takes an arbitrary `path` parameter and proxies it to the Stash server. While it's designed for media paths, there's no validation that the path is actually a media resource.

**Concerns:**
- Path is user-controlled and passed directly to the Stash server
- Could potentially be used to access non-media Stash endpoints via the proxy
- API key is automatically appended, giving the client access to any Stash endpoint

**Example:** An attacker might try:
```
GET /api/proxy/stash?path=/graphql&query=mutation{...}
```

**Mitigating Factors:**
- The proxy uses HTTP GET only (line 299), so POST-based GraphQL mutations wouldn't work
- Stash may have its own path restrictions

**Recommendation:** Validate the path against an allowlist of prefixes:
```typescript
const ALLOWED_PATHS = ['/scene/', '/image/', '/performer/', '/studio/', '/gallery/'];
if (!ALLOWED_PATHS.some(p => path.startsWith(p))) {
  return res.status(403).json({ error: "Path not allowed" });
}
```

---

## Routes with Proper Security Controls

### Setup Routes (All Secure)

| Route | Guard | Status |
|-------|-------|--------|
| `GET /api/setup/status` | None needed (read-only info) | ✅ OK |
| `POST /api/setup/create-admin` | `userCount === 0` | ✅ OK |
| `POST /api/setup/test-stash-connection` | None (validates external creds) | ✅ OK |
| `POST /api/setup/create-stash-instance` | `instanceCount === 0` | ✅ OK |
| `POST /api/setup/reset` | `setupComplete === false && userCount <= 1` | ✅ OK |
| `GET /api/setup/stash-instance` | `authenticate` middleware | ✅ OK |

### Auth Routes

| Route | Guard | Status |
|-------|-------|--------|
| `POST /api/auth/login` | Password verification | ✅ OK |
| `POST /api/auth/logout` | None needed (clears cookie) | ✅ OK |
| `GET /api/auth/me` | `authenticate` middleware | ✅ OK |
| `GET /api/auth/check` | `authenticate` middleware | ✅ OK |
| `POST /api/auth/first-time-password` | **NONE - VULNERABLE** | ❌ Critical |

### Proxy Routes

| Route | Guard | Status |
|-------|-------|--------|
| `GET /api/proxy/scene/:id/preview` | ID parameter only | ⚠️ See below |
| `GET /api/proxy/scene/:id/webp` | ID parameter only | ⚠️ See below |
| `GET /api/proxy/stash?path=...` | Path parameter validation | ⚠️ Medium |
| `GET /api/proxy/image/:imageId/:type` | Checks image exists in DB | ✅ OK |

**Note on scene proxies:** These routes take a scene ID and proxy to Stash. An unauthenticated user could enumerate scene IDs to access any content. However, this is likely intentional for performance (avoiding auth on every image load). Document this as a design decision.

### Inline Routes in api.ts

| Route | Guard | Status |
|-------|-------|--------|
| `GET /api/health` | None needed (status only) | ✅ OK |
| `GET /api/version` | None needed (version only) | ✅ OK |

---

## Recommendations Summary

1. **[Critical] Fix `/api/auth/first-time-password`** - Add setup completion check
2. **[Medium] Harden `/api/proxy/stash`** - Validate path against allowlist
3. **[Info] Document proxy design** - Explain why scene/image proxies are unauthenticated (performance)

---

## Files Reviewed

- `server/initializers/api.ts` - Route mounting
- `server/routes/auth.ts` - Auth routes
- `server/routes/setup.ts` - Setup routes
- `server/controllers/setup.ts` - Setup controller guards
- `server/controllers/proxy.ts` - Proxy handlers
