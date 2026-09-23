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

- The original video file in its native format
- Filename based on the scene title
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
3. A progress indicator shows the zip creation status
4. When complete, the download starts automatically

!!! info "Processing Time"
    Playlist downloads require server-side processing to create the zip file. Large playlists may take several minutes.

### What's Included

The zip is named after the playlist.

Each playlist zip contains:

| File | Description |
|------|-------------|
| **Scene videos** | All video files in original quality |
| **playlist.m3u** | M3U playlist file for media players |
| **{scene}.nfo** | Kodi-compatible metadata for each scene |

### M3U Playlist

The included `playlist.m3u` file lets you play scenes in order using any media player that supports M3U format (VLC, Plex, Kodi, etc.).

### NFO Metadata

Each scene includes a `.nfo` file with Kodi-compatible metadata:

- Title and description
- Performers
- Studio
- Tags
- Runtime
- Date added

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
| **Pending** | Download queued, waiting to start |
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

### Download stuck on "Processing"

Playlist zip creation can take time for large playlists. If it seems stuck:
1. Check the Downloads page for the current progress percentage
2. For very large playlists, processing may take 10+ minutes
3. If progress doesn't change for extended periods, try:
   - Refreshing the page
   - Deleting and retrying the download

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
