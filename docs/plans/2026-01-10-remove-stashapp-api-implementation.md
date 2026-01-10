# Remove stashapp-api Dependency - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the external stashapp-api npm package with internal GraphQL queries and codegen, eliminating the dependency while preserving all functionality.

**Architecture:** Copy the codegen pattern from stashapp-api into peek-stash-browser/server. Write lean .graphql operation files, generate TypeScript SDK, create StashClient class that wraps the SDK. Update all imports.

**Tech Stack:** graphql-request, @graphql-codegen/cli, @graphql-codegen/typescript, @graphql-codegen/typescript-operations, @graphql-codegen/typescript-graphql-request

---

## Task 1: Install Dependencies

**Files:**
- Modify: `server/package.json`

**Step 1: Add graphql-request as runtime dependency**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
npm install graphql-request@^6.1.0 graphql@^16.8.0
```

**Step 2: Add codegen as dev dependencies**

```bash
npm install -D @graphql-codegen/cli@^5.0.0 @graphql-codegen/typescript@^4.0.0 @graphql-codegen/typescript-operations@^4.0.0 @graphql-codegen/typescript-graphql-request@^6.0.0
```

**Step 3: Verify installation**

Run: `npm ls graphql-request @graphql-codegen/cli`
Expected: Both packages listed with versions

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add graphql codegen dependencies"
```

---

## Task 2: Create Codegen Configuration

**Files:**
- Create: `server/codegen.yml`
- Modify: `server/.gitignore`

**Step 1: Create codegen.yml**

Create file `server/codegen.yml`:

```yaml
schema: ./schema.json
documents: graphql/operations/**/*.graphql
generates:
  ./graphql/generated/graphql.ts:
    plugins:
      - typescript
      - typescript-operations
      - typescript-graphql-request
    config:
      # Use string for ID scalars (Stash uses string IDs)
      scalars:
        ID: string
        Time: string
        Timestamp: string
        Int64: number
        Any: any
        Map: Record<string, any>
        BoolMap: Record<string, boolean>
        PluginConfigMap: Record<string, any>
        Upload: File
      # Generate lean types
      skipTypename: true
      # Use type imports
      useTypeImports: true
```

**Step 2: Add schema.json to .gitignore**

Append to `server/.gitignore`:

```
# Generated Stash schema (fetched via introspection)
schema.json
```

**Step 3: Commit**

```bash
git add codegen.yml .gitignore
git commit -m "chore: add graphql codegen configuration"
```

---

## Task 3: Create GraphQL Operations Directory Structure

**Files:**
- Create: `server/graphql/operations/` (directory)
- Create: `server/graphql/generated/.gitkeep`

**Step 1: Create directory structure**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
mkdir -p graphql/operations graphql/generated
touch graphql/generated/.gitkeep
```

**Step 2: Commit**

```bash
git add graphql/
git commit -m "chore: create graphql directory structure"
```

---

## Task 4: Copy GraphQL Operations from stashapp-api

**Files:**
- Create: `server/graphql/operations/*.graphql` (38 files)

**Step 1: Copy all .graphql files**

Copy all files from `c:\Users\carrotwaxr\code\stashapp-api\src\operations\` to `c:\Users\carrotwaxr\code\peek-stash-browser\server\graphql\operations\`

Files to copy:
- configuration.graphql
- findGalleries.graphql
- findGallery.graphql
- findGalleryIDs.graphql
- findGroup.graphql
- findGroupIDs.graphql
- findGroups.graphql
- findImageIDs.graphql
- findImages.graphql
- findPerformerIDs.graphql
- findPerformers.graphql
- findSceneIDs.graphql
- findScenes.graphql
- findScenesCompact.graphql
- findStudioIDs.graphql
- findStudios.graphql
- findTagIDs.graphql
- findTags.graphql
- galleryUpdate.graphql
- groupUpdate.graphql
- imageUpdate.graphql
- metadataScan.graphql
- performerDestroy.graphql
- performersDestroy.graphql
- performerUpdate.graphql
- sceneAddPlay.graphql
- sceneDecrementO.graphql
- sceneDestroy.graphql
- sceneIncrementO.graphql
- sceneSaveActivity.graphql
- scenesUpdate.graphql
- sceneUpdate.graphql
- studioDestroy.graphql
- studiosDestroy.graphql
- studioUpdate.graphql
- tagCreate.graphql
- tagDestroy.graphql
- tagsDestroy.graphql
- tagUpdate.graphql

**Step 2: Commit**

```bash
git add graphql/operations/
git commit -m "feat: add graphql operations (copied from stashapp-api)"
```

---

## Task 5: Copy Stash Schema and Run Codegen

**Files:**
- Create: `server/schema.json` (copied, gitignored)
- Create: `server/graphql/generated/graphql.ts` (generated)

**Step 1: Copy schema.json from stashapp-api**

```bash
cp c:\Users\carrotwaxr\code\stashapp-api\schema.json c:\Users\carrotwaxr\code\peek-stash-browser\server\schema.json
```

**Step 2: Run codegen**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
npx graphql-codegen --config codegen.yml
```

Expected: File created at `graphql/generated/graphql.ts`

**Step 3: Verify generated file exists and has content**

```bash
head -50 graphql/generated/graphql.ts
```

Expected: TypeScript code with type definitions and getSdk function

**Step 4: Commit generated file**

```bash
git add graphql/generated/graphql.ts
git commit -m "feat: generate typescript types from stash schema"
```

---

## Task 6: Add npm Scripts for Codegen

**Files:**
- Modify: `server/package.json`

**Step 1: Add scripts**

Add these scripts to `server/package.json`:

```json
{
  "scripts": {
    "stash:codegen": "graphql-codegen --config codegen.yml",
    "stash:refresh": "echo 'Copy schema.json from stashapp-api or run introspection, then run npm run stash:codegen'"
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add stash codegen npm scripts"
```

---

## Task 7: Create StashClient Class

**Files:**
- Create: `server/graphql/StashClient.ts`

**Step 1: Create StashClient.ts**

Create file `server/graphql/StashClient.ts`:

```typescript
/**
 * StashClient - Internal GraphQL client for Stash API
 *
 * Replaces the external stashapp-api package with an internal implementation.
 * Uses graphql-request and generated SDK from codegen.
 */
import { GraphQLClient } from "graphql-request";
import { getSdk } from "./generated/graphql.js";

export interface StashClientConfig {
  url: string;
  apiKey: string;
}

/**
 * Client for interacting with the Stash GraphQL API.
 * Each instance maintains its own connection configuration.
 */
export class StashClient {
  private client: GraphQLClient;
  private sdk: ReturnType<typeof getSdk>;

  constructor(config: StashClientConfig) {
    this.client = new GraphQLClient(config.url, {
      headers: { ApiKey: config.apiKey },
    });
    this.sdk = getSdk(this.client);
  }

  // Find operations
  findPerformers = (...args: Parameters<ReturnType<typeof getSdk>["FindPerformers"]>) =>
    this.sdk.FindPerformers(...args);
  findStudios = (...args: Parameters<ReturnType<typeof getSdk>["FindStudios"]>) =>
    this.sdk.FindStudios(...args);
  findScenes = (...args: Parameters<ReturnType<typeof getSdk>["FindScenes"]>) =>
    this.sdk.FindScenes(...args);
  findScenesCompact = (...args: Parameters<ReturnType<typeof getSdk>["FindScenesCompact"]>) =>
    this.sdk.FindScenesCompact(...args);
  findTags = (...args: Parameters<ReturnType<typeof getSdk>["FindTags"]>) =>
    this.sdk.FindTags(...args);
  findGroups = (...args: Parameters<ReturnType<typeof getSdk>["FindGroups"]>) =>
    this.sdk.FindGroups(...args);
  findGroup = (...args: Parameters<ReturnType<typeof getSdk>["FindGroup"]>) =>
    this.sdk.FindGroup(...args);
  findGalleries = (...args: Parameters<ReturnType<typeof getSdk>["FindGalleries"]>) =>
    this.sdk.FindGalleries(...args);
  findGallery = (...args: Parameters<ReturnType<typeof getSdk>["FindGallery"]>) =>
    this.sdk.FindGallery(...args);
  findImages = (...args: Parameters<ReturnType<typeof getSdk>["FindImages"]>) =>
    this.sdk.FindImages(...args);

  // ID-only find operations (for cleanup/deletion detection)
  findSceneIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindSceneIDs"]>) =>
    this.sdk.FindSceneIDs(...args);
  findPerformerIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindPerformerIDs"]>) =>
    this.sdk.FindPerformerIDs(...args);
  findStudioIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindStudioIDs"]>) =>
    this.sdk.FindStudioIDs(...args);
  findTagIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindTagIDs"]>) =>
    this.sdk.FindTagIDs(...args);
  findGroupIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindGroupIDs"]>) =>
    this.sdk.FindGroupIDs(...args);
  findGalleryIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindGalleryIDs"]>) =>
    this.sdk.FindGalleryIDs(...args);
  findImageIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindImageIDs"]>) =>
    this.sdk.FindImageIDs(...args);

  // Update operations
  sceneUpdate = (...args: Parameters<ReturnType<typeof getSdk>["sceneUpdate"]>) =>
    this.sdk.sceneUpdate(...args);
  scenesUpdate = (...args: Parameters<ReturnType<typeof getSdk>["scenesUpdate"]>) =>
    this.sdk.scenesUpdate(...args);
  performerUpdate = (...args: Parameters<ReturnType<typeof getSdk>["performerUpdate"]>) =>
    this.sdk.performerUpdate(...args);
  studioUpdate = (...args: Parameters<ReturnType<typeof getSdk>["studioUpdate"]>) =>
    this.sdk.studioUpdate(...args);
  galleryUpdate = (...args: Parameters<ReturnType<typeof getSdk>["galleryUpdate"]>) =>
    this.sdk.galleryUpdate(...args);
  groupUpdate = (...args: Parameters<ReturnType<typeof getSdk>["groupUpdate"]>) =>
    this.sdk.groupUpdate(...args);
  imageUpdate = (...args: Parameters<ReturnType<typeof getSdk>["imageUpdate"]>) =>
    this.sdk.imageUpdate(...args);
  tagCreate = (...args: Parameters<ReturnType<typeof getSdk>["tagCreate"]>) =>
    this.sdk.tagCreate(...args);
  tagUpdate = (...args: Parameters<ReturnType<typeof getSdk>["tagUpdate"]>) =>
    this.sdk.tagUpdate(...args);

  // Destroy operations
  performerDestroy = (...args: Parameters<ReturnType<typeof getSdk>["performerDestroy"]>) =>
    this.sdk.performerDestroy(...args);
  performersDestroy = (...args: Parameters<ReturnType<typeof getSdk>["performersDestroy"]>) =>
    this.sdk.performersDestroy(...args);
  tagDestroy = (...args: Parameters<ReturnType<typeof getSdk>["tagDestroy"]>) =>
    this.sdk.tagDestroy(...args);
  tagsDestroy = (...args: Parameters<ReturnType<typeof getSdk>["tagsDestroy"]>) =>
    this.sdk.tagsDestroy(...args);
  studioDestroy = (...args: Parameters<ReturnType<typeof getSdk>["studioDestroy"]>) =>
    this.sdk.studioDestroy(...args);
  studiosDestroy = (...args: Parameters<ReturnType<typeof getSdk>["studiosDestroy"]>) =>
    this.sdk.studiosDestroy(...args);
  sceneDestroy = (...args: Parameters<ReturnType<typeof getSdk>["sceneDestroy"]>) =>
    this.sdk.sceneDestroy(...args);

  // Activity operations
  sceneIncrementO = (...args: Parameters<ReturnType<typeof getSdk>["sceneIncrementO"]>) =>
    this.sdk.sceneIncrementO(...args);
  sceneDecrementO = (...args: Parameters<ReturnType<typeof getSdk>["SceneDecrementO"]>) =>
    this.sdk.SceneDecrementO(...args);
  sceneSaveActivity = (...args: Parameters<ReturnType<typeof getSdk>["SceneSaveActivity"]>) =>
    this.sdk.SceneSaveActivity(...args);
  sceneAddPlay = (...args: Parameters<ReturnType<typeof getSdk>["SceneAddPlay"]>) =>
    this.sdk.SceneAddPlay(...args);

  // Configuration
  configuration = (...args: Parameters<ReturnType<typeof getSdk>["Configuration"]>) =>
    this.sdk.Configuration(...args);

  // Metadata operations
  metadataScan = (...args: Parameters<ReturnType<typeof getSdk>["metadataScan"]>) =>
    this.sdk.metadataScan(...args);
}
```

**Step 2: Commit**

```bash
git add graphql/StashClient.ts
git commit -m "feat: create StashClient class wrapping generated SDK"
```

---

## Task 8: Create Type Re-exports

**Files:**
- Create: `server/graphql/types.ts`

**Step 1: Create types.ts for re-exporting commonly used types**

Create file `server/graphql/types.ts`:

```typescript
/**
 * Re-export commonly used types from generated GraphQL types.
 *
 * These replace the type imports that previously came from stashapp-api.
 */

// Entity types
export type {
  Performer,
  Scene,
  Tag,
  Studio,
  Gallery,
  Group,
  Image,
} from "./generated/graphql.js";

// Filter types
export type {
  PerformerFilterType,
  SceneFilterType,
  TagFilterType,
  StudioFilterType,
  GalleryFilterType,
  ImageFilterType,
  GroupFilterType,
  FindFilterType,
} from "./generated/graphql.js";

// Input types
export type {
  ScanMetadataInput,
  PerformerDestroyInput,
  TagDestroyInput,
  StudioDestroyInput,
  SceneDestroyInput,
  TagCreateInput,
  TagUpdateInput,
  SceneUpdateInput,
  PerformerUpdateInput,
  StudioUpdateInput,
  GalleryUpdateInput,
  GroupUpdateInput,
  ImageUpdateInput,
} from "./generated/graphql.js";

// Enums - re-export as values (not just types)
export {
  CriterionModifier,
  GenderEnum,
} from "./generated/graphql.js";
```

**Step 2: Commit**

```bash
git add graphql/types.ts
git commit -m "feat: add type re-exports for generated graphql types"
```

---

## Task 9: Update StashInstanceManager

**Files:**
- Modify: `server/services/StashInstanceManager.ts`

**Step 1: Update imports and type references**

Replace:
```typescript
import { StashApp } from "stashapp-api";
```

With:
```typescript
import { StashClient } from "../graphql/StashClient.js";
```

**Step 2: Update Map type**

Replace:
```typescript
private instances = new Map<string, StashApp>();
```

With:
```typescript
private instances = new Map<string, StashClient>();
```

**Step 3: Update initialization**

Replace:
```typescript
const stash = StashApp.init({
  url: config.url,
  apiKey: config.apiKey,
});
```

With:
```typescript
const stash = new StashClient({
  url: config.url,
  apiKey: config.apiKey,
});
```

**Step 4: Update getDefault return type**

Replace:
```typescript
getDefault(): StashApp {
```

With:
```typescript
getDefault(): StashClient {
```

**Step 5: Update get return type**

Replace:
```typescript
get(instanceId: string): StashApp | undefined {
```

With:
```typescript
get(instanceId: string): StashClient | undefined {
```

**Step 6: Build to verify**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
npm run build
```

Expected: No TypeScript errors related to StashInstanceManager

**Step 7: Commit**

```bash
git add services/StashInstanceManager.ts
git commit -m "refactor: use StashClient instead of StashApp in StashInstanceManager"
```

---

## Task 10: Update setup.ts Controller

**Files:**
- Modify: `server/controllers/setup.ts`

**Step 1: Update imports**

Replace:
```typescript
import { StashApp } from "stashapp-api";
```

With:
```typescript
import { StashClient } from "../graphql/StashClient.js";
```

**Step 2: Update testStashConnection function**

Replace:
```typescript
const testStash = StashApp.init({ url, apiKey });
```

With:
```typescript
const testStash = new StashClient({ url, apiKey });
```

**Step 3: Update createFirstStashInstance function**

Replace:
```typescript
const testStash = StashApp.init({ url, apiKey });
```

With:
```typescript
const testStash = new StashClient({ url, apiKey });
```

**Step 4: Commit**

```bash
git add controllers/setup.ts
git commit -m "refactor: use StashClient instead of StashApp in setup controller"
```

---

## Task 11: Update types/entities.ts

**Files:**
- Modify: `server/types/entities.ts`

**Step 1: Update imports**

Replace:
```typescript
import type {
  Gallery,
  Group,
  Image,
  Performer,
  Scene,
  Studio,
  Tag,
} from "stashapp-api";
```

With:
```typescript
import type {
  Gallery,
  Group,
  Image,
  Performer,
  Scene,
  Studio,
  Tag,
} from "../graphql/types.js";
```

**Step 2: Build to verify**

```bash
npm run build
```

Expected: No errors - types should be compatible

**Step 3: Commit**

```bash
git add types/entities.ts
git commit -m "refactor: import entity types from internal graphql module"
```

---

## Task 12: Update types/filters.ts

**Files:**
- Modify: `server/types/filters.ts`

**Step 1: Update type re-exports**

Replace:
```typescript
export type {
  PerformerFilterType,
  SceneFilterType,
  TagFilterType,
  StudioFilterType,
  GalleryFilterType,
  ImageFilterType,
  GroupFilterType,
} from "stashapp-api";

export { CriterionModifier, GenderEnum } from "stashapp-api";
```

With:
```typescript
export type {
  PerformerFilterType,
  SceneFilterType,
  TagFilterType,
  StudioFilterType,
  GalleryFilterType,
  ImageFilterType,
  GroupFilterType,
} from "../graphql/types.js";

export { CriterionModifier, GenderEnum } from "../graphql/types.js";
```

**Step 2: Commit**

```bash
git add types/filters.ts
git commit -m "refactor: import filter types from internal graphql module"
```

---

## Task 13: Update utils/stashUrlProxy.ts

**Files:**
- Modify: `server/utils/stashUrlProxy.ts`

**Step 1: Update imports**

Replace:
```typescript
import type {
  Gallery,
  Group,
  Performer,
  Scene,
  Studio,
  Tag,
} from "stashapp-api";
```

With:
```typescript
import type {
  Gallery,
  Group,
  Performer,
  Scene,
  Studio,
  Tag,
} from "../graphql/types.js";
```

**Step 2: Commit**

```bash
git add utils/stashUrlProxy.ts
git commit -m "refactor: import types from internal graphql module in stashUrlProxy"
```

---

## Task 14: Update types/api/playlist.ts

**Files:**
- Modify: `server/types/api/playlist.ts`

**Step 1: Update imports**

Replace:
```typescript
import type { Scene } from "stashapp-api";
```

With:
```typescript
import type { Scene } from "../../graphql/types.js";
```

**Step 2: Commit**

```bash
git add types/api/playlist.ts
git commit -m "refactor: import Scene type from internal graphql module in playlist types"
```

---

## Task 15: Update StashSyncService.ts Imports

**Files:**
- Modify: `server/services/StashSyncService.ts`

**Step 1: Update type imports**

Replace:
```typescript
import type { Gallery, Group, Performer, Scene, Studio, Tag } from "stashapp-api";
```

With:
```typescript
import type { Gallery, Group, Performer, Scene, Studio, Tag } from "../graphql/types.js";
```

**Step 2: Build to verify**

```bash
npm run build
```

Expected: No errors

**Step 3: Commit**

```bash
git add services/StashSyncService.ts
git commit -m "refactor: import types from internal graphql module in StashSyncService"
```

---

## Task 16: Update Integration Test File

**Files:**
- Modify: `server/tests/services/StashSyncService.stash.test.ts`

**Step 1: Update imports**

Replace:
```typescript
import { StashApp } from "stashapp-api";
```

With:
```typescript
import { StashClient } from "../../graphql/StashClient.js";
```

**Step 2: Update StashApp.init to new StashClient**

Replace:
```typescript
stash = StashApp.init({
  url: process.env.STASH_URL!,
  apiKey: process.env.STASH_API_KEY!,
});
```

With:
```typescript
stash = new StashClient({
  url: process.env.STASH_URL!,
  apiKey: process.env.STASH_API_KEY!,
});
```

**Step 3: Update variable type declaration**

Replace:
```typescript
let stash: StashApp;
```

With:
```typescript
let stash: StashClient;
```

**Step 4: Commit**

```bash
git add tests/services/StashSyncService.stash.test.ts
git commit -m "refactor: use StashClient in integration tests"
```

---

## Task 17: Remove stashapp-api Dependency

**Files:**
- Modify: `server/package.json`

**Step 1: Uninstall stashapp-api**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
npm uninstall stashapp-api
```

**Step 2: Verify removal**

```bash
grep -r "stashapp-api" . --include="*.ts" --include="*.json" | grep -v node_modules | grep -v ".git"
```

Expected: No matches (package.json should no longer have it)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove stashapp-api dependency"
```

---

## Task 18: Full Build Verification

**Files:** None (verification only)

**Step 1: Clean build**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
rm -rf dist
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No new lint errors

**Step 3: Run unit tests**

```bash
npm run test:run
```

Expected: All tests pass

---

## Task 19: Integration Test (Optional - Requires Stash Server)

**Files:** None (verification only)

**Step 1: Run integration tests if Stash server available**

```bash
cd c:\Users\carrotwaxr\code\peek-stash-browser\server
npm run test:integration
```

Expected: All integration tests pass

---

## Task 20: Final Commit and Summary

**Step 1: Create summary commit if any uncommitted changes**

```bash
git status
```

If clean, skip. Otherwise:

```bash
git add -A
git commit -m "chore: cleanup after stashapp-api removal"
```

**Step 2: View commit history for this branch**

```bash
git log --oneline main..HEAD
```

Expected: Series of commits showing the migration

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] No imports from "stashapp-api" remain
- [ ] `server/graphql/` directory contains:
  - `operations/*.graphql` (38 files)
  - `generated/graphql.ts`
  - `StashClient.ts`
  - `types.ts`
- [ ] `server/package.json` does not list stashapp-api
