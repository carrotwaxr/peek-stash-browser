# Downloads

Download scenes, images, and entire playlists for offline viewing. Downloads require permission from an admin.

## Requirements

To use the download feature, you must have the appropriate permissions:

| Permission | What You Can Download |
|------------|----------------------|
| **Can Download Files** | Individual scenes and images |
| **Can Download Playlists** | Playlist zip archives |

Downloads follow the same rules as browsing. You can download only scenes and images you can see: your hidden items, any content restrictions and your Content Sources selection apply. Each file comes from the Stash server it lives on. A file in your download history stops downloading if the item is later hidden or restricted for you, or if your download permission is removed.

!!! note "Permission Setup"
    Admins grant download permissions through [User Groups](user-management.md#user-groups) or [individual user permissions](user-management.md#permissions).

---

## Downloading Scenes

### From Scene Detail Page

1. Open any scene to view its detail page
2. Click the **Download** button in the action bar
3. The download starts immediately

Scene downloads stream directly from your Stash server—there's no waiting for file preparation.

### What's Downloaded

- The original video file in its native format, saved with the file's own extension (`.mkv`, `.wmv`, ...), as stored in Stash
- Filename based on the scene title, made safe on every system: characters a file system does not allow (such as `/`, `:` and `?`) become `_`, control characters and dots or spaces at either end are dropped, and a very long title is shortened
- Titles and playlist names in any script (accents, curly quotes, emoji, CJK) keep their exact name; very old download tools that ignore the UTF-8 name get an ASCII version with `_` in place of other characters.

---

## Downloading Images

### From Image Lightbox

1. Open any image in the lightbox viewer
2. Click the **Download** button
3. The image downloads immediately

Image downloads also stream directly from Stash.

---

## Downloading Playlists

Playlist downloads create a zip archive containing all scenes in the playlist, plus helpful metadata files.

Anyone a playlist is shared with can download it too, with the Can Download Playlists permission. The zip holds only the scenes you can see. A finished zip stops downloading if the playlist is unshared or deleted, or if your permission is removed.

### Starting a Playlist Download

1. Open a playlist
2. Click the **Download** button
3. The zip waits its turn (**Pending**), then is built (**Processing**, with its progress) on the Downloads page
4. Open Downloads and click **Download** when it shows **Completed**

!!! info "Processing Time"
    Playlist downloads require server-side processing to create the zip file. Large playlists may take several minutes.

Zips are built one at a time, in the order they were asked for. You can have 3 playlist downloads in progress (pending or processing) at once; wait for one to finish before starting a fourth. Clicking Download again on a playlist whose zip is still in progress shows that same zip.

When its turn comes, the zip is checked again: if your Can Download Playlists permission was removed, or the playlist was unshared or deleted, it fails instead of being built. If the server restarts while a zip is waiting or being built, it is built again after the restart.

### What's Included

The zip is named after the playlist.

Each playlist zip contains:

| File | Description |
|------|-------------|
| **Scene videos** | Each in its own format and extension, in original quality |
| **playlist.m3u** | M3U playlist file for media players |
| **{scene}.nfo** | Kodi-compatible metadata for each scene |

Two scenes with the same title are saved as `Title.mkv` and `Title (2).mp4`, each with its own `.nfo`.

A scene Peek cannot fetch when the zip is built (deleted from Stash since the last sync, or on a Stash server that was turned off) is left out, and the Downloads page says how many.

### M3U Playlist

The included `playlist.m3u` file lets you play scenes in order using any media player that supports M3U format (VLC, Plex, Kodi, etc.).

### NFO Metadata

Each scene includes a `.nfo` file with Kodi-compatible metadata:

- Title and description
- Release date
- Performers, studio and tags: only those you can see, as in Peek
- Your rating, if you rated the scene (never the rating stored in Stash)

These files allow Kodi and similar media managers to display proper metadata for your downloaded scenes.

### Size Limits

Playlist downloads have a maximum size limit (default: 10 GB). If a playlist exceeds this limit:

1. You'll see an error message showing the playlist size
2. Consider splitting large playlists into smaller ones
3. Or ask an admin to increase the limit

---

## Download History

View all your downloads in one place.

### Accessing Download History

- Click your username in the header → **Downloads**
- Or navigate directly to `/downloads`

### Download Status

| Status | Description |
|--------|-------------|
| **Pending** | Waiting its turn; zips are built one at a time |
| **Processing** | Playlist zip being created (shows progress %) |
| **Completed** | Ready to download |
| **Failed** | Something went wrong |
| **Expired** | Playlist zips expire after 24 hours; scene and image downloads made before this release are also marked expired. Download them again. |

### Managing Downloads

From the Downloads page, you can:

| Action | Description |
|--------|-------------|
| **Download** | Download a completed file |
| **Retry** | Retry a failed playlist download |
| **Delete** | Remove a download from your history |

### Download Expiration

Completed playlist downloads are available for **24 hours**, then automatically cleaned up to save server space. Scene and image downloads don't expire, but their links from before this release are marked expired: start those again from the scene or image.

---

## Troubleshooting

### "You do not have permission to download"

Your account doesn't have download permissions. Ask an admin to:
1. Add you to a group with download permissions, or
2. Enable download permissions on your account directly

### "This playlist has no scenes you can download"

Every scene in the playlist is hidden or restricted for you, deleted from Stash, or on a Stash server you don't use. The zip holds only scenes you can see, so there is nothing to download.

### "Playlist exceeds maximum download size"

The playlist is too large. Options:
- Split the playlist into smaller playlists
- Download individual scenes instead
- Ask an admin to increase the size limit

### "You have 3 playlist downloads in progress"

Each user can have 3 playlist zips pending or processing at once. Wait for one to complete or fail, or delete one, then start the next.

### A playlist download failed

The Downloads page shows why:

- **You no longer have permission to download playlists**: your Can Download Playlists permission was removed after you asked for the zip.
- **Playlist not found**: the playlist was deleted or is no longer shared with you.
- **The zip grew past the size limit**: the playlist is now larger than the size limit (see [Size Limits](#size-limits)).
- **Not enough space on the server for this zip; try again later**: the server's disk does not have room for the zip plus 1 GB. Retry later, or ask an admin to free space.
- **None of the playlist's scenes could be fetched from Stash**: every scene was deleted from Stash or is on a Stash server that was turned off.

### Download stuck on "Pending" or "Processing"

Zips are built one at a time, so a zip can wait while another user's is built. Large playlists can take 10+ minutes. A server restart does not leave a zip stuck: it is built again after the restart. If progress doesn't change for a long time, delete the download and start it again.

### Downloaded file won't play

- Verify your media player supports the video codec
- Try VLC media player (supports most formats)
- Check that the download completed fully (not corrupted)

### NFO files not recognized

- Ensure your media manager is configured for NFO metadata
- In Kodi, enable "Local information only" for the media source
- File must be in the same folder as the video with matching name

---

## Next Steps

- [Playlists](playlists.md) — Create and manage playlists
- [User Management](user-management.md) — Understand permissions and groups
- [Troubleshooting](../getting-started/troubleshooting.md) — Fix common issues
