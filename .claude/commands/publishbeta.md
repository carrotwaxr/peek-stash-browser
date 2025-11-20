# Publish Beta Release

Publish a beta release of peek-stash-browser to Docker Hub.

## Process

Follow these exact steps to publish a beta release:

1. **Ensure you're on master branch with latest changes**
   - Run `git checkout master && git pull origin master`
   - Verify working tree is clean

2. **Determine the next beta version number**
   - Check latest version tags: `git tag --list "v*" --sort=-version:refname | head -5`
   - Beta versions use format: `vX.Y.Z-beta.N` (e.g., `v1.6.0-beta.1`)
   - Use the next incremental beta number for the current minor version

3. **Update package.json files with new beta version**
   - Update `client/package.json` version field
   - Update `server/package.json` version field
   - Use npm version command: `npm version X.Y.Z-beta.N --no-git-tag-version`

4. **Update lock files**
   - Run `npm install` in both client/ and server/ directories
   - This updates package-lock.json files

5. **Commit version bump**
   - Stage changes: `git add client/package.json server/package.json client/package-lock.json server/package-lock.json`
   - Commit: `git commit -m "chore: bump version to X.Y.Z-beta.N"`

6. **Push to master FIRST**
   - Run: `git push origin master`
   - Wait for push to complete

7. **Create and push tag (ONLY ONCE)**
   - Create tag: `git tag vX.Y.Z-beta.N`
   - Push tag: `git push origin vX.Y.Z-beta.N`
   - **IMPORTANT**: Only push the tag ONCE. If the workflow doesn't trigger, do NOT delete and re-push

8. **Verify workflow triggered**
   - Check GitHub Actions: https://github.com/carrotwaxr/peek-stash-browser/actions
   - Workflow should start within 10-30 seconds
   - If it doesn't start after 1 minute, there may be a GitHub issue - use a different tag name

9. **Monitor the build**
   - Watch the workflow run to ensure it completes successfully
   - Build should take approximately 5-10 minutes
   - Check that Docker images are published with `:beta` tag

10. **Verify the release**
    - Check GitHub Releases page
    - Verify Docker Hub has the new image tags
    - Beta releases are marked as "pre-release" on GitHub

## Important Notes

- **NEVER delete and re-push a tag** - GitHub Actions has event deduplication and will ignore subsequent pushes of the same tag name
- If a workflow fails to trigger, use a different version number (e.g., bump to next beta)
- Beta releases are automatically tagged as `:beta` on Docker Hub
- Beta releases are marked as pre-releases on GitHub
- The workflow file is at `.github/workflows/docker-build.yml`

## Docker Tags Created

Beta releases create the following Docker tags:
- `carrotwaxr/peek-stash-browser:X.Y.Z-beta.N` (specific version)
- `carrotwaxr/peek-stash-browser:X.Y` (major.minor)
- `carrotwaxr/peek-stash-browser:beta` (latest beta)

## Difference from Alpha

Beta releases are more stable than alpha releases and are typically:
- Released after alpha testing is complete
- Used for wider testing before stable release
- Expected to have fewer bugs than alpha
- Closer to production-ready

## Troubleshooting

**Workflow doesn't trigger after pushing tag:**
1. Wait 60 seconds - sometimes there's a delay
2. Check if tag was already pushed before (GitHub deduplicates)
3. If still not triggering, use next beta number (e.g., beta.2 instead of beta.1)
4. Never delete and re-push the same tag name

**Build fails:**
1. Check the workflow run logs on GitHub Actions
2. Common issues: Docker Hub credentials, build errors, test failures
3. Fix the issue on master branch
4. Use next beta version number for retry
