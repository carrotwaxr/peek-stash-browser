# Publish Alpha Release

Publish an alpha release of peek-stash-browser to Docker Hub.

## Process

Follow these exact steps to publish an alpha release:

1. **Ensure you're on master branch with latest changes**
   - Run `git checkout master && git pull origin master`
   - Verify working tree is clean
   - Verify latest changes are merged to master

2. **Determine the next version number**
   - Check latest version tags: `git tag --list "v*" --sort=-version:refname | head -5`
   - Check current package.json versions
   - Use standard semantic versioning (e.g., `v1.6.1`, `v1.6.2`, etc.)
   - **No `-alpha.N` suffix** - just increment the patch/minor/major version

3. **Update package.json files with new version**
   - Update `client/package.json` version field
   - Update `server/package.json` version field
   - Use npm version command in each directory:
     - `cd client && npm version X.Y.Z --no-git-tag-version`
     - `cd server && npm version X.Y.Z --no-git-tag-version`

4. **Update lock files**
   - Run `npm install` in both client/ and server/ directories
   - This updates package-lock.json files with new version

5. **Commit version bump**
   - Stage changes: `git add client/package.json server/package.json client/package-lock.json server/package-lock.json`
   - Commit: `git commit -m "chore: bump version to X.Y.Z"`

6. **Push to master FIRST**
   - Run: `git push origin master`
   - Wait for push to complete successfully

7. **Create and push tag (ONLY ONCE)**
   - Create tag: `git tag vX.Y.Z`
   - Push tag: `git push origin vX.Y.Z`
   - **IMPORTANT**: Only push the tag ONCE. If the workflow doesn't trigger, do NOT delete and re-push

8. **Verify workflow triggered**
   - Check GitHub Actions: https://github.com/carrotwaxr/peek-stash-browser/actions
   - Workflow should start within 10-30 seconds
   - If it doesn't start after 1 minute, there may be a GitHub issue - use a different tag name

9. **Monitor the build**
   - Watch the workflow run to ensure it completes successfully
   - Build should take approximately 5-10 minutes
   - Check that Docker images are published

10. **Verify the release**
    - Check GitHub Releases page
    - Verify Docker Hub has the new image tags
    - Releases are automatically created by the workflow

## Important Notes

- **NEVER delete and re-push a tag** - GitHub Actions has event deduplication and will ignore subsequent pushes of the same tag name
- If a workflow fails to trigger, use a different version number (e.g., bump to next patch version)
- All releases use standard semantic versioning (no alpha/beta suffixes)
- The workflow file is at `.github/workflows/docker-build.yml`

## Docker Tags Created

Each release creates the following Docker tags:
- `carrotwaxr/peek-stash-browser:X.Y.Z` (specific version)
- `carrotwaxr/peek-stash-browser:X.Y` (major.minor)
- `carrotwaxr/peek-stash-browser:latest` (latest stable release)

## Troubleshooting

**Workflow doesn't trigger after pushing tag:**
1. Wait 60 seconds - sometimes there's a delay
2. Check if tag was already pushed before (GitHub deduplicates)
3. If still not triggering, use next alpha number (e.g., alpha.2 instead of alpha.1)
4. Never delete and re-push the same tag name

**Build fails:**
1. Check the workflow run logs on GitHub Actions
2. Common issues: Docker Hub credentials, build errors, test failures
3. Fix the issue on master branch
4. Use next alpha version number for retry
