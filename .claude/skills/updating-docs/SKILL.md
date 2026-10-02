---
name: updating-docs
description: Use when creating or updating documentation in peek-stash-browser. Covers MkDocs conventions, doc structure, API reference generation, and plan document formatting.
---

# Updating Documentation

## Documentation Stack

- **Engine**: MkDocs with Material theme
- **Deployment**: GitHub Pages via GitHub Actions (auto on push to main)
- **API Reference**: Auto-generated from TypeScript source via `server/scripts/generate-api-docs.ts`

## Directory Structure

```
docs/
  index.md                      # Landing page
  what-peek-is.md               # What Peek adds to Stash
  getting-started/              # Installation, config, troubleshooting (6 files)
  user-guide/                   # Feature documentation (19 files)
  development/                  # Developer docs (4 files)
  reference/                    # API reference (generated), entity relationships, Docker basics
  plans/                        # Local design docs and plans (gitignored)
  audits/                       # Documentation audits
  assets/                       # Images, logos
  stylesheets/                  # Custom CSS
  javascripts/                  # Custom JS
```

## Writing User-Facing Docs

### Page Structure

```markdown
# Feature Name

Brief description of what this feature does and why it's useful.

## Section Name

Step-by-step instructions or explanation.

### Subsection

More detail as needed.

!!! tip
    Helpful hint for the user.

!!! warning
    Important caution about potential issues.

!!! info
    Additional context or background information.
```

### Conventions

- **H1**: Page title only (one per page)
- **H2**: Major sections
- **H3**: Subsections within a section
- **Admonitions**: Use `!!! tip`, `!!! warning`, `!!! info`, `!!! note` for callouts
- **Numbered lists**: For step-by-step procedures
- **Tables**: For keyboard shortcuts, comparisons, reference data
- **Cross-links**: Use relative paths: `[Link Text](../user-guide/playlists.md)`
- **Code blocks**: Always specify language (```bash, ```json, etc.)
- **Feature location**: Include where to find the feature ("Location: Home page > Settings")
- **Troubleshooting**: Add a section at the end for common issues

### What Goes Where

| Content | Directory |
|---------|-----------|
| How to install/configure | `getting-started/` |
| How to use a feature | `user-guide/` |
| How the code works | `development/` |
| API endpoints, entity models | `reference/` |
| Feature design before implementation | `plans/` (local only) |

## Plan Documents

`docs/plans/` is gitignored, so plans stay local. Write them with `/fluffer:plan-write`, which sets the format and naming. Never add a plan to the MkDocs nav.

## API Reference

The API reference at `docs/reference/api-reference.md` is **auto-generated**. Do not edit it manually.

### Regenerating

```bash
cd server && npm run generate-api-docs
```

`server/scripts/generate-api-docs.ts` writes one entry for every `router.<method>(...)` in `server/routes/` and every `app.<method>(...)` in `server/initializers/api.ts`, whatever the handler: a name, a name in `authenticated()` or `libraryHandler()`, or written inline. Each entry gives:

- **Authentication**, from the middleware in front of the route (`router.use`, the mount in `api.ts`, the route's own): None, Session (`authenticate`), Admin (`requireAdmin`), Session or signed link (`authenticateStreamRequest`), or None until setup starts, then Admin (`requireAdminOnceSetupStarted`).
- **Description**, from the JSDoc block above the route, `//` lines right above it, or a comment trailing it. `//` lines above a route that the next line continues with another route head a section and describe none of them.
- **Types**, from the handler's `TypedRequest`/`TypedAuthRequest`/`TypedLibraryRequest` and `TypedResponse` parameters, resolved in `server/types/api/` and `shared/types/api/`.

The generator fails and writes nothing when a route file holds a route call it cannot read (a new handler wrapper, a path that is not a string literal) or is not mounted in `api.ts`: teach `server/scripts/lib/routeParser.ts` the new shape. Its tests live in `server/tests/scripts/lib/`. The docs workflow regenerates the page before every deploy, so the published page follows the code even when the committed copy lags.

### Triggers for Auto-Rebuild

The docs GitHub Action rebuilds when these paths change:
- `docs/**`
- `mkdocs.yml`
- `server/routes/**`
- `server/types/api/**`
- `server/controllers/**`
- `server/scripts/**`
- `server/initializers/api.ts`
- `shared/types/**`
- `.github/workflows/docs.yml`

## Redirects

When moving a doc to a new path, add a redirect in `mkdocs.yml`:

```yaml
plugins:
  - redirects:
      redirect_maps:
        'old/path.md': 'new/path.md'
```

## Local Preview

```bash
npm run docs   # from the repo root; serves http://localhost:8001
```

It runs `.venv/bin/mkdocs`, so create that virtualenv once with `mkdocs-material`, `mkdocs-minify-plugin` and `mkdocs-redirects` installed. Port 8000 belongs to the Peek server.
