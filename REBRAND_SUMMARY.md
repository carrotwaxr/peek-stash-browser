# 🏷️ Peek Stash Browser - Rebrand Summary

## Name Changes Applied

### Main Product Name

- **Old**: Stash Player
- **New**: Peek Stash Browser
- **Usage**: GitHub repo name, Docker Hub image, unRAID template display name

### Component Names (Internal)

- **Client**: `peek-client` (package name)
- **Server**: `peek-server` (package name)
- **Database**: `peek-db` (volume name)
- **Network**: `peek-network` (Docker network)

### Short Name

- **Usage**: "Peek" for user-facing elements, logos, favicons, titles

## Files Updated

### Package Configuration

- ✅ `client/package.json` - Name changed to "peek-client"
- ✅ `server/package.json` - Name changed to "peek-server", description updated
- ✅ `.env.example` - Database path and temp directory updated

### Docker Configuration

- ✅ `docker-compose.yml` - Services renamed (peek-client, peek-server), volumes (peek-db), network (peek-network)
- ✅ `publish-images.sh` - Updated to build single container as "peek-stash-browser"
- ✅ `publish-images.bat` - Updated to build single container as "peek-stash-browser"

### Documentation

- ✅ `README.md` - Title updated to "Peek Stash Browser"
- ✅ `unraid-template.xml` - Repository and project URLs updated

## Docker Hub Image

- **Name**: `carrotwaxr/peek-stash-browser:latest`
- **Build**: Single container with frontend + backend + SQLite

## Next Steps Required

### GitHub Repository

1. Rename repository from `stash-player` to `peek-stash-browser`
2. Update repository description
3. Update any GitHub Actions/workflows if they exist

### Local Development

1. Rename local folder from `stash-player` to `peek-stash-browser`
2. Update any local scripts or shortcuts
3. Restart Docker containers to pick up new names

### Docker Hub

1. Create new repository: `carrotwaxr/peek-stash-browser`
2. Configure automated builds (optional)
3. Set repository description and README

### Environment Files

1. Update actual `.env` file (not in git) to match new database name
2. Test that existing data migrates properly

## Backward Compatibility

- ⚠️ **Breaking Change**: New Docker image names
- ⚠️ **Breaking Change**: New Docker volume names
- ⚠️ **Breaking Change**: Database file name changed
- ✅ **Safe**: No API changes, existing data can be migrated
