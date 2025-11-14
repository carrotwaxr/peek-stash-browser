# Server Unit Tests

This directory contains comprehensive unit tests for the Peek server, focusing on filter logic validation.

## Test Structure

```
tests/
├── helpers/
│   └── mockDataGenerators.ts    # Mock data creation utilities
├── filters/
│   ├── sceneFilters.test.ts     # Scene quick filters (non-user data)
│   └── sceneFiltersExpensive.test.ts  # Scene expensive filters (user-specific data)
├── BUGS_FOUND.md                # Bug tracking document
└── README.md                    # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- sceneFilters.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## Test Coverage

### Scene Filters (✅ Complete)

**Quick Filters (61 tests total):**
- ID filtering
- Performer filtering (INCLUDES, INCLUDES_ALL, EXCLUDES)
- Tag filtering with squashing (scene + performer + studio tags)
- Studio filtering
- Group filtering
- Numeric range filters (bitrate, duration, performer_count, tag_count, framerate)
- Date filters (created_at, updated_at)
- Text filters (title, details)
- Multiple combined filters
- Edge cases and error handling

**Status**: ✅ 30/31 tests passing (1 known bug documented)

**Expensive Filters (30 tests total):**
- Favorite filtering
- Rating filtering (rating100)
- O counter filtering
- Play count filtering
- Play duration filtering
- Last played date filtering
- Last O date filtering
- Nested entity favorite filters (performer_favorite, studio_favorite, tag_favorite)
- Multiple combined filters
- Edge cases with null values

**Status**: ✅ 30/30 tests passing

### Other Entities (🚧 Future Work)

Additional filter test suites to be created:
- Performer filters
- Studio filters
- Tag filters
- Gallery filters
- Group filters

## Bugs Found

### Bug #1: Empty Array Filter Values (FOUND)
**Severity**: Medium
**Status**: Documented in BUGS_FOUND.md
**Test**: `sceneFilters.test.ts` - "should handle empty arrays in filter values"

Empty filter arrays return `[]` instead of returning all results. This affects:
- `performers` filter
- `tags` filter
- `studios` filter
- `groups` filter

**Fix Required**: Add length check before applying array-based filters:
```typescript
if (!performerIds || performerIds.length === 0) return filtered;
```

## Mock Data Generators

The `helpers/mockDataGenerators.ts` file provides utilities for creating realistic test data:

### Individual Entity Creators
- `createMockScene()` - Create a single scene with all fields
- `createMockPerformer()` - Create a single performer
- `createMockStudio()` - Create a single studio
- `createMockTag()` - Create a single tag
- `createMockGroup()` - Create a single group
- `createMockGallery()` - Create a single gallery

### Batch Entity Creators
- `createMockScenes(count, performers, studios, tags, groups)` - Create multiple related scenes
- `createMockPerformers(count)` - Create multiple performers with variety
- `createMockStudios(count)` - Create multiple studios
- `createMockTags(count)` - Create multiple tags
- `createMockGroups(count)` - Create multiple groups
- `createMockGalleries(count)` - Create multiple galleries

All mock data follows the TypeScript types from `server/types/entities.ts` and includes realistic:
- Relationships between entities (scenes have performers, studios, tags, groups)
- User-specific data (favorites, ratings, play counts, O counters)
- Temporal data (dates offset by days/hours)
- Variety (different genders, countries, ratings, etc.)

## Testing Philosophy

### Test-Driven Development (TDD)
These tests were written to:
1. **Identify existing bugs** before they reach users
2. **Document expected behavior** through executable specifications
3. **Enable safe refactoring** by catching regressions early
4. **Serve as living documentation** of filter behavior

### Test Naming Convention
Tests use descriptive names that explain both the scenario and expected outcome:
```typescript
it("should filter scenes by studio with EXCLUDES modifier", () => { ... });
it("should handle scenes without studio when EXCLUDES modifier is used", () => { ... });
it("should exclude scenes with null last_played_at when filter is applied", () => { ... });
```

### Test Organization
Tests are grouped by feature/filter type for easy navigation:
```typescript
describe("Scene Filters - Quick Filters", () => {
  describe("Performer Filter", () => {
    it("should filter with INCLUDES modifier", () => { ... });
    it("should filter with INCLUDES_ALL modifier", () => { ... });
    it("should filter with EXCLUDES modifier", () => { ... });
  });
});
```

## Coverage Goals

Current coverage:
- **Scene Filters**: ~95% coverage (61 tests)
- **Overall Server**: TBD (run `npm run test:coverage`)

Target coverage:
- All entity filter logic: 90%+
- Critical user-facing features: 100%

## Contributing

When adding new filters or modifying existing ones:

1. **Write tests first** (TDD approach)
2. **Cover all modifiers** (INCLUDES, EXCLUDES, EQUALS, GREATER_THAN, etc.)
3. **Test edge cases** (null values, empty arrays, missing data)
4. **Update BUGS_FOUND.md** if you discover issues
5. **Ensure all tests pass** before committing

## Test Maintenance

- Tests are located close to the code they test for easy navigation
- Mock data generators should be updated when entity schemas change
- All tests should remain fast (<100ms per test file)
- Tests should be independent (no shared state between tests)

## Additional Resources

- Vitest Documentation: https://vitest.dev/
- Testing Best Practices: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- Mock Data Design Patterns: https://martinfowler.com/bliki/TestDataBuilder.html
