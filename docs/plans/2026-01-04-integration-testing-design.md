# Integration Testing Infrastructure Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add API integration tests that validate Peek works correctly against a real Stash server.

**Architecture:** Spin up a real Express server, make HTTP requests against it, validate responses. Tests run against a persistent SQLite database synced from the user's Stash.

**Tech Stack:** Vitest, native fetch, existing Express app

---

## Critical Principle: Tests Expose Real Bugs

**When an integration test fails:**
1. **Assume the test is right** - It's checking real behavior against real data
2. **Investigate the failure** - Don't modify the test to make it pass
3. **Fix the application code** - If the test reveals a bug, fix the bug
4. **Only adjust the test if** - The test itself has a logic error or wrong assumptions

Integration tests hit real APIs with real data. Failures are likely real bugs that need fixing, not tests that need adjusting.

---

## Architecture Overview

### Directory Structure

```
server/
├── tests/                    # Existing unit tests
├── integration/              # New integration tests
│   ├── setup/                # Fresh DB setup tests
│   │   └── initialSetup.test.ts
│   ├── api/                  # API endpoint tests
│   │   ├── scenes.test.ts
│   │   ├── performers.test.ts
│   │   ├── studios.test.ts
│   │   ├── tags.test.ts
│   │   ├── groups.test.ts
│   │   ├── galleries.test.ts
│   │   ├── images.test.ts
│   │   ├── auth.test.ts
│   │   ├── contentRestrictions.test.ts
│   │   ├── hiddenEntities.test.ts
│   │   └── playlists.test.ts
│   ├── fixtures/
│   │   ├── testEntities.ts          # Gitignored - user's entity IDs
│   │   └── testEntities.example.ts  # Template showing structure
│   ├── helpers/
│   │   ├── globalSetup.ts     # Starts server before tests
│   │   ├── globalTeardown.ts  # Stops server after tests
│   │   ├── testClient.ts      # HTTP client with auth
│   │   └── dbSetup.ts         # DB initialization helpers
│   ├── test.db                # Gitignored - persistent test database
│   └── vitest.integration.config.ts
```

---

## Configuration & Secrets

### Environment Variables

Tests reuse existing `.env` file (already gitignored):
- `STASH_URL` - Stash server URL
- `STASH_API_KEY` - Stash API key

Test-specific overrides in `integration/.env.integration` (gitignored).

### Gitignore Additions

```
# Integration test secrets and data
server/integration/.env.integration
server/integration/fixtures/testEntities.ts
server/integration/*.db
```

### Test Entities Template

`testEntities.example.ts` (committed):
```typescript
// Copy to testEntities.ts and fill in IDs from your Stash
export const TEST_ENTITIES = {
  // A scene that exists and has performers, tags, studio
  sceneWithRelations: "12345",
  // A performer with multiple scenes
  performerWithScenes: "67",
  // A tag used on multiple entities
  commonTag: "89",
  // A studio with scenes
  studioWithScenes: "12",
  // A group with scenes
  groupWithScenes: "34",
  // A gallery with images
  galleryWithImages: "56",
  // A tag to use for content restriction tests
  restrictableTag: "78",
};
```

---

## Test Execution Flow

### NPM Scripts

```json
{
  "test:integration": "vitest run --config integration/vitest.integration.config.ts",
  "test:integration:watch": "vitest --config integration/vitest.integration.config.ts",
  "test:integration:fresh": "FRESH_DB=true npm run test:integration"
}
```

### Standard Run (`npm run test:integration`)

1. Loads `.env` from project root
2. Uses persistent `integration/test.db`
3. If DB doesn't exist, runs setup automatically (create admin, connect Stash, sync)
4. Starts Express server on port 9999
5. Runs all integration tests
6. Stops server
7. Test users created during tests are cleaned up; admin and synced data persist

### Fresh Run (`npm run test:integration:fresh`)

1. Deletes `integration/test.db` if exists
2. Runs setup test suite first (tests the setup wizard flow)
3. Then runs all other integration tests

### Test Lifecycle

- **Before each test file:** Creates a test user for isolation
- **After each test file:** Cleans up test user and test-specific data
- **Global setup:** Validates Stash reachable, starts server
- **Global teardown:** Stops server

---

## Test Server & HTTP Client

### Global Setup

```typescript
// integration/helpers/globalSetup.ts
export async function setup() {
  // 1. Set DATABASE_URL to integration/test.db
  // 2. Run prisma migrations if needed
  // 3. If FRESH_DB or DB empty, run initial setup
  // 4. Start Express server on port 9999
  // 5. Export base URL for tests
}

export async function teardown() {
  // Stop Express server
}
```

### Test Client

```typescript
// integration/helpers/testClient.ts
export class TestClient {
  private baseUrl: string;
  private token?: string;

  async login(username: string, password: string): Promise<void>;
  async get<T>(path: string): Promise<{ status: number; data: T }>;
  async post<T>(path: string, body: object): Promise<{ status: number; data: T }>;
  async put<T>(path: string, body: object): Promise<{ status: number; data: T }>;
  async delete<T>(path: string): Promise<{ status: number; data: T }>;
}

// Pre-configured instances
export const adminClient: TestClient;  // Logged in as admin
export const guestClient: TestClient;  // No auth
```

---

## Test Priority Tiers

### Tier 1 - Critical (Initial Implementation)

1. **Stash connection & sync** - Data comes through correctly
2. **All entity queries** - scenes, performers, studios, tags, groups, galleries, images
3. **Basic filters** - performer, studio, tag filters work across entities
4. **Authentication** - login/logout, protected routes reject unauthenticated
5. **Content restrictions** - excluded content doesn't appear in results

### Tier 2 - Important (Second Phase)

6. **Pagination** - page/per_page parameters work correctly
7. **Sorting** - different sort options return correctly ordered results
8. **Similar scenes** - recommendations return relevant results
9. **User hidden entities** - hiding works, cascades correctly
10. **Playlist operations** - CRUD, adding/removing items

### Tier 3 - Nice to Have (Future)

11. **Watch history tracking**
12. **Ratings/favorites sync to Stash**
13. **Custom carousels**
14. **O-counter updates**

---

## Pre-Release Command

New skill at `.claude/skills/pre-release.md`:

```markdown
---
name: pre-release
description: Run all validation checks before tagging a release
---

# Pre-Release Checks

## Steps

1. Run server unit tests: `cd server && npm test`
2. Run server linter: `cd server && npm run lint`
3. Run client unit tests: `cd client && npm test`
4. Run client linter: `cd client && npm run lint`
5. Run integration tests: `cd server && npm run test:integration`
6. Build client: `cd client && npm run build`
7. Build production Docker image: `docker build -f Dockerfile.production -t peek:test .`
8. Report results summary
```

---

## CLAUDE.md Documentation

Add to CLAUDE.md:

```markdown
### Integration Testing

Integration tests run against a real Stash server to validate API functionality.

**Setup (first time):**
1. Ensure `.env` has `STASH_URL` and `STASH_API_KEY`
2. Copy `server/integration/fixtures/testEntities.example.ts` to `testEntities.ts`
3. Fill in entity IDs from your Stash library

**Running tests:**
- `npm run test:integration` - Run against persistent test DB
- `npm run test:integration:fresh` - Reset DB and test setup flow
- `npm run test:integration:watch` - Watch mode for development

**Pre-release:**
Run `/pre-release` to execute all validation checks before tagging a release.
```

---

## Implementation Notes

- Tests use the user's real Stash server (read-only for most operations)
- Write operations (ratings, favorites, O-counters) use consistent test entities
- No Dockerized test Stash - too much infrastructure for marginal benefit
- Server runs directly via Node.js, not in Docker during tests
- Persistent DB avoids slow Stash sync on every test run
