# Code Analysis & Testing Setup

This document describes the code analysis and testing tools configured for peek-stash-browser.

## Tools Installed

### 1. depcheck - Unused Dependency Detection
**Purpose**: Find unused dependencies in package.json

**Usage**:
```bash
# Client
cd client && npm run depcheck

# Server
cd server && npm run depcheck
```

**Configuration**:
- `client/.depcheckrc.json` - Ignores build tools and type definitions
- `server/.depcheckrc.json` - Ignores TypeScript tooling

**Current Findings** (as of setup):
- **Client**: `@tailwindcss/aspect-ratio` - Not registered in tailwind.config.js
- **Server**: `graphql-tag` - Not imported anywhere

### 2. Knip - Comprehensive Code Analysis
**Purpose**: Find unused files, exports, dependencies, and types

**Usage**:
```bash
# Client
cd client && npm run knip

# Server
cd server && npm run knip
```

**Configuration**:
- `client/knip.json` - Entry points: main.jsx, vite.config.js
- `server/knip.json` - Entry points: index.ts, api.ts, prisma/seed.ts

**What it detects**:
- Unused files
- Unused exports within files
- Unused dependencies
- Unused types (TypeScript)
- Unreachable code

### 3. Vitest Coverage - Test Coverage Analysis
**Purpose**: Measure which code is tested vs untested

**Usage**:
```bash
# Client
cd client && npm run test:coverage

# Server
cd server && npm run test:coverage
```

**Configuration**:
- `client/vitest.config.js` - Coverage config for React components
- `server/vitest.config.ts` - Coverage config for Node.js code

**Output**:
- Terminal: Text summary showing % coverage per file
- HTML: `coverage/index.html` - Interactive visual report
- JSON: `coverage/coverage-final.json` - Machine-readable data

**Coverage targets** (recommended):
- **Critical paths**: 80%+ (controllers, services, utils)
- **UI components**: 60%+ (harder to test, less critical)
- **Overall**: 70%+

### 4. Combo Analysis Script
**Purpose**: Run both depcheck and knip together

**Usage**:
```bash
# Client
cd client && npm run analyze

# Server
cd server && npm run analyze
```

## Workflow Recommendations

### Phase 1: Quick Wins (Low Risk)
1. Run `npm run depcheck` in both packages
2. Remove confirmed unused dependencies:
   - `@tailwindcss/aspect-ratio` from client
   - `graphql-tag` from server
3. Test that build still works: `npm run build`

### Phase 2: Deep Analysis (Requires Review)
1. Run `npm run knip` in both packages
2. Review findings carefully - some may be false positives:
   - **Entry points**: Code used in HTML, dynamic imports
   - **Types**: May be exported for consumers
   - **Exports**: May be part of public API
3. Remove confirmed dead code
4. Re-run tests to ensure nothing broke

### Phase 3: Test Coverage (Ongoing)
1. Run `npm run test:coverage` to establish baseline
2. Identify critical untested code (services, controllers)
3. Write tests for high-value, low-coverage areas
4. Use coverage + knip together:
   - If file shows 0% coverage AND knip says unused → safe to delete
   - If file shows 0% coverage but knip says used → needs tests

### Phase 4: Continuous Improvement
1. Add coverage thresholds to fail builds below target
2. Run `npm run analyze` before major refactors
3. Check coverage on new features before merge
4. Use knip periodically to catch accumulating dead code

## Common False Positives

### depcheck
- Build tool config files (tailwind, vite, eslint)
- Type definitions used implicitly
- Plugins configured in config files

### Knip
- Dynamic imports (`import(\`./\${name}\`)`)
- Route handlers registered dynamically
- Exports intended for external consumers
- Types used only in JSDoc comments

### Coverage
- Defensive error handling (hard to trigger)
- Edge cases requiring complex setup
- Code handling rare platform differences

## Integration with CI/CD

Future: Add to GitHub Actions workflow:

```yaml
- name: Check code quality
  run: |
    cd client && npm run analyze
    cd ../server && npm run analyze

- name: Check test coverage
  run: |
    cd client && npm run test:coverage
    cd ../server && npm run test:coverage
```

## Tips & Best Practices

1. **Don't blindly remove everything**: Review knip findings carefully
2. **Test after removal**: Always run tests after removing "unused" code
3. **Coverage isn't everything**: 100% coverage doesn't mean bug-free
4. **Focus on value**: Test critical paths first (auth, transcoding, API)
5. **Use together**: Combine coverage + knip for best signal

## Quick Reference

| Command | Client | Server | Description |
|---------|--------|--------|-------------|
| `npm run depcheck` | ✅ | ✅ | Find unused dependencies |
| `npm run knip` | ✅ | ✅ | Find unused code/exports |
| `npm run analyze` | ✅ | ✅ | Run both depcheck + knip |
| `npm run test:coverage` | ✅ | ✅ | Generate coverage report |
| `npm test` | ✅ | ✅ | Run tests in watch mode |
| `npm run test:ui` | ✅ | ✅ | Run tests with UI |

## Files Modified

**Client**:
- `package.json` - Added scripts and dependencies
- `vitest.config.js` - Added coverage configuration
- `knip.json` - Knip configuration
- `.depcheckrc.json` - Depcheck ignore rules

**Server**:
- `package.json` - Added scripts and dependencies
- `vitest.config.ts` - Added coverage configuration
- `knip.json` - Knip configuration
- `.depcheckrc.json` - Depcheck ignore rules

**Root**:
- `.gitignore` - Already excludes coverage/ directory
