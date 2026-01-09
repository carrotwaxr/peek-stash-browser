# Auth Session Improvements Design

## Overview

Improve the authentication experience with two key features:
1. **Sliding session expiry** - Sessions refresh while actively browsing, only expiring after 4 hours of inactivity
2. **Redirect preservation** - When redirected to login (session expired or direct navigation), return to the original intended URL after successful login

## Current State

- JWT tokens with 24-hour fixed expiry
- No token refresh mechanism - users must re-login after 24 hours regardless of activity
- Login always redirects to `/` - no preservation of intended destination
- No global handling of 401/403 responses - auth failures not gracefully handled mid-session

## Design

### 1. Session Refresh on API Activity

**Approach:** Server issues a fresh JWT token on authenticated API requests when the current token is aging.

**Server changes in `server/middleware/auth.ts`:**

In the `authenticateToken` middleware, after successfully verifying the token:
1. Decode the token to get its `iat` (issued-at) timestamp
2. If token was issued more than 20 hours ago, generate a new token
3. Set the new token in the response cookie with same settings as login

**Why 20 hours threshold:** With 24-hour token expiry, refreshing at 20 hours means:
- Active users get seamless session continuation
- 4-hour inactivity window before session truly expires
- Minimizes unnecessary cookie writes (not every request)

**Constants:**
```typescript
const TOKEN_EXPIRY_HOURS = 24;
const TOKEN_REFRESH_THRESHOLD_HOURS = 20; // Refresh if older than this
```

### 2. Client-Side Auth Failure Handling

**Approach:** Global API interceptor catches 401/403 and redirects to login with URL preservation.

**Changes in `client/src/services/api.js`:**

Add response handling that:
1. Detects 401 or 403 status codes
2. Excludes auth endpoints (`/api/auth/login`, `/api/auth/check`) from redirect logic
3. Saves current URL (`pathname + search`) to sessionStorage
4. Redirects to `/login`
5. Uses a flag to prevent multiple simultaneous redirects

**Why sessionStorage:** Cleared on tab close, so stale redirects don't persist. Survives page reload during redirect.

**Storage key:** `peek_auth_redirect`

### 3. ProtectedRoute URL Preservation

**Changes in `client/src/components/guards/RouteGuards.jsx`:**

When `ProtectedRoute` redirects an unauthenticated user to `/login`:
1. Save `location.pathname + location.search` to sessionStorage
2. Then redirect to `/login`

**Why here too:** Catches deep links and bookmarks when user is already logged out.

### 4. Login Redirect Handling

**Changes in `client/src/components/pages/Login.jsx`:**

On successful login:
1. Check sessionStorage for `peek_auth_redirect`
2. If present: clear it, navigate to that URL
3. If absent: navigate to `/` (default)

**Changes in `client/src/App.jsx`:**

Remove the hard-coded `window.location.href = "/"` from `onLoginSuccess`. Let Login component handle navigation.

## Files to Modify

| File | Changes |
|------|---------|
| `server/middleware/auth.ts` | Add token refresh logic - check age, issue new cookie if > 20 hours old |
| `client/src/services/api.js` | Add 401/403 interceptor with redirect-to-login |
| `client/src/components/guards/RouteGuards.jsx` | Save intended URL to sessionStorage before login redirect |
| `client/src/components/pages/Login.jsx` | Read redirect target, navigate there on success |
| `client/src/App.jsx` | Remove hard-coded `/` redirect from onLoginSuccess |

## Constants

**Server:**
- `TOKEN_EXPIRY_HOURS = 24`
- `TOKEN_REFRESH_THRESHOLD_HOURS = 20`

**Client:**
- `REDIRECT_STORAGE_KEY = "peek_auth_redirect"`

## Testing

**Unit tests:**
- Token refresh logic: verify new token issued when token age > 20 hours
- Token refresh logic: verify no new token when token age < 20 hours

**Integration tests:**
- 401 response from protected endpoint triggers redirect
- Redirect URL preserved in sessionStorage
- Login success navigates to preserved URL
- Login without preserved URL navigates to `/`

**Manual testing:**
- Let session expire during active browsing
- Verify redirect to login preserves current URL
- Verify successful login returns to original page with query params intact
