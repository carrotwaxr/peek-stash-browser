# Database Backup Feature Design

## Overview

Allow admins to create, view, and delete database backups from the Settings UI.

## Requirements

- Create timestamped backups of the SQLite database
- View list of existing backups with size and date
- Delete individual backups
- No auto-pruning - users manage cleanup manually
- No restore functionality (manual file replacement required)

## API Endpoints

All endpoints require admin authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/database/backups` | List all backups with metadata |
| `POST` | `/api/admin/database/backup` | Create a new backup |
| `DELETE` | `/api/admin/database/backups/:filename` | Delete a specific backup |

### Response Formats

**GET /api/admin/database/backups**
```json
{
  "backups": [
    {
      "filename": "peek-stash-browser.db.backup-20260118-104532",
      "size": 246747136,
      "createdAt": "2026-01-18T10:45:32.000Z"
    }
  ]
}
```

**POST /api/admin/database/backup**
```json
{
  "backup": {
    "filename": "peek-stash-browser.db.backup-20260118-104532",
    "size": 246747136,
    "createdAt": "2026-01-18T10:45:32.000Z"
  }
}
```

## Technical Approach

### Backup Mechanism

Use SQLite's `VACUUM INTO` command for atomic, consistent backups:

```typescript
await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);
```

This is safer than file copy because it guarantees a consistent snapshot even during active writes.

### Backup Location

Same directory as the database (`CONFIG_DIR`, typically `/app/data`). This ensures backups are included in the Docker volume mount and persist with the database.

### Filename Pattern

`peek-stash-browser.db.backup-YYYYMMDD-HHmmss`

Example: `peek-stash-browser.db.backup-20260118-104532`

### Security

The delete endpoint validates filenames against the expected pattern to prevent path traversal:

```typescript
const BACKUP_PATTERN = /^peek-stash-browser\.db\.backup-\d{8}-\d{6}$/;
```

## UI Design

New "Backup" tab in Server Settings section.

### Layout

1. **Header** - Title "Backup" with description
2. **Create Backup button** - Primary action
3. **Backup list** - Table/list of existing backups showing:
   - Formatted date (e.g., "Jan 18, 2026 at 10:45 AM")
   - File size (e.g., "235 MB")
   - Delete button with confirmation
4. **Empty state** when no backups exist

### States

- Loading: Show spinner while fetching list
- Creating: Button shows "Creating backup..." and is disabled
- Deleting: Show confirmation dialog, then processing state

## Files to Create

- `server/services/DatabaseBackupService.ts`
- `server/routes/databaseBackup.ts`
- `server/tests/services/DatabaseBackupService.test.ts`
- `server/tests/routes/databaseBackup.test.ts`
- `client/src/components/settings/tabs/BackupTab.jsx`

## Files to Modify

- `server/initializers/api.ts` - Register route
- `client/src/components/pages/SettingsPage.jsx` - Add tab

## Future Considerations (Out of Scope)

- Restore from backup via UI
- Auto-pruning old backups
- Scheduled automatic backups
- Download backup to browser
