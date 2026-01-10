# Zod Schemas

This directory contains Zod schemas that define the shape of Peek's API responses.

## Philosophy

1. **Schemas are the source of truth** - TypeScript types are derived from schemas using `z.infer<T>`
2. **Composable fragments** - Build complex types from reusable pieces (refs -> entities -> responses)
3. **Runtime validation** - Catch transformation bugs before clients see malformed data
4. **Extra field stripping** - Use `.strip()` to ensure we never leak internal data

## Directory Structure

```
schemas/
├── index.ts          # Main re-export barrel
├── base.ts           # Primitives (dates, timestamps, pagination)
├── refs.ts           # EntityRef schemas (id + name + minimal fields)
├── scene.ts          # Scene entity schemas
├── performer.ts      # Performer entity schemas
├── tag.ts            # Tag entity schemas
├── studio.ts         # Studio entity schemas
├── gallery.ts        # Gallery entity schemas
├── image.ts          # Image entity schemas
├── group.ts          # Group entity schemas
└── api/              # API response wrappers
    ├── index.ts
    └── common.ts     # Error/success responses
```

## Usage

### Basic Validation

```typescript
import { SceneSchema } from "../schemas/index.js";
import { validateResponse } from "../utils/schemaValidation.js";

// In controller
const validatedScene = validateResponse(SceneSchema, scene, "scene response");
res.json(validatedScene);
```

### Type Inference

```typescript
import { SceneSchema } from "../schemas/index.js";
import type { Scene } from "../schemas/index.js";

// Type is inferred from schema
const scene: Scene = SceneSchema.parse(data);
```

### Stripping Extra Fields

```typescript
// Ensure no internal fields leak to client
const safeScene = SceneSchema.strip().parse(scene);
```

### Validation Utilities

Three helpers are available in `utils/schemaValidation.ts`:

```typescript
// Validate and throw on failure
validateResponse(schema, data, context);

// Validate and return null on failure (no throw)
safeValidateResponse(schema, data, context);

// Validate array, filtering out invalid items
validateArrayResponse(schema, items, context);
```

## Migration Strategy

Schemas are being adopted incrementally. Current status:
- [ ] `/api/library/scenes` - Schema defined, not yet validated at runtime
- [ ] `/api/library/performers` - Schema defined, not yet validated at runtime
- [ ] Other endpoints - Pending

To enable validation for an endpoint:
1. Import the appropriate schema
2. Use `validateResponse()` before `res.json()`
3. Test with invalid data to ensure errors are logged

## Adding New Schemas

1. Create schema file in `schemas/` directory
2. Export from `schemas/index.ts`
3. Add tests in `tests/schemas/schemas.test.ts`
4. Document any non-obvious field meanings
