---
name: self-review
description: Perform a code review before creating a PR
---

# Code Review Quality Check

Perform a code review for the current peek-stash-browser branch. Your job is to ensure code quality, identify potential bugs or improvements, and find gaps in test coverage.

## Step 1: Understand What Changed

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Review the diff to understand the scope and intent of the changes before running automated checks.

## Step 2: Invoke Relevant Best-Practice Skills

Based on which files changed, invoke the corresponding skills to have their guidelines in context during review. Check the diff stat and invoke all that apply:

| Files changed | Skill to invoke |
|---|---|
| `client/src/components/**` (UI/layout) | `visual-style`, `responsive-design`, `web-design-guidelines` |
| `client/src/components/**` (React logic) | `vercel-react-best-practices`, `vercel-composition-patterns` |
| `server/controllers/**`, `server/routes/**` | `nodejs-backend-patterns`, `api-design-principles` |
| `server/services/**` (TypeScript) | `typescript-advanced-types` |
| `server/prisma/**`, migration files | `prisma-sqlite-expert` |
| `server/graphql/**`, `codegen.yml` | `graphql-patterns` |
| `Dockerfile*`, `docker-compose*` | `docker-best-practices` |
| Test files (`**/*.test.*`) | `writing-tests` |

Invoke these skills using the Skill tool before proceeding to the code quality review. You don't need to invoke every skill — only those relevant to the diff.

## Step 3: Code Quality Review

Review the diff against these guidelines (supplemented by the skills invoked above):

### General Principles

- **DRY** - Don't repeat yourself; extract shared logic
- **YAGNI** - Don't build features that aren't needed yet
- **Single Responsibility** - Functions and components do one thing well
- **Readable code over comments** - Code should be self-documenting through clear naming and structure. Use comments only for:
  - Explaining _why_ something unusual is done (not _what_)
  - Highlighting important gotchas or edge cases
  - Noting things we might want to revisit later
  - Do NOT add comments that just describe what readable code already shows

### React Patterns

- Prefer event/action-driven handlers over useEffect when possible
- useEffect should have proper dependency arrays and clear purpose
- Use memoization (useMemo, useCallback) when it provides real value, not everywhere
- Avoid large monolithic useEffect blocks - break into smaller effects or extract logic
- Components should have clear separation of concerns

### API & Server

- Follows Express best practices
- Error handling is present and meaningful
- Input validation on API endpoints
- All operations are high-performance and scalable - Peek users sometimes have 100k+ scenes, etc

### UI/UX

- Mobile-first design, responsive across all screen sizes
- Visual consistency - same components/patterns used throughout:
  - Accordions, tabs, cards, indicators look the same everywhere
  - Same icons represent the same actions/items across the app
- Uses theme variables (e.g., `var(--bg-card)`) not hardcoded colors

### Code Hygiene

- No unused imports or variables
- No leftover console.log statements (unless intentional logging)
- No hardcoded values that should be constants or config
- No commented-out code blocks
- mkdocs and README (docs) are kept up to date with changes

## Step 4: Automated Testing Checklist

Run each check and fix any failures before proceeding:

### Server

```bash
cd server && npm test
```

Expected: All tests pass

```bash
cd server && npm run lint
```

Expected: No errors (warnings OK)

```bash
cd server && npx tsc --noEmit
```

Expected: No type errors

```bash
cd server && npm run test:integration
```

Expected: All tests pass

### Client

```bash
cd client && npm test
```

Expected: All tests pass

```bash
cd client && npm run lint
```

Expected: No errors (warnings OK)

```bash
cd client && npm run build
```

Expected: Build succeeds without errors

## Step 5: Issue Severity Guide

**Blocking (must fix before PR):**

- Test failures
- Build/lint errors
- Security issues (XSS, injection, exposed secrets)
- Broken functionality
- Missing error handling that could crash the app

**Should fix (fix now or create follow-up issue):**

- Missing test coverage for new logic (see `writing-tests` skill for conventions)
- Performance issues (unnecessary re-renders, N+1 queries)
- Accessibility problems
- Inconsistent UI patterns

**Note for later (document but don't block):**

- Minor refactoring opportunities
- Nice-to-have improvements
- Tech debt observations

## Step 6: Create Pull Request

After all blocking issues are fixed, create a GitHub PR:

```bash
gh pr create --title "Brief descriptive title" --body "$(cat <<'EOF'
## Summary
- Bullet points of what this PR does from user perspective
- Focus on behavior changes, not implementation details

## Test plan
- [ ] Manual testing steps if applicable
- [ ] Automated test coverage notes
EOF
)"
```

Do not include Claude attribution in PR descriptions.
