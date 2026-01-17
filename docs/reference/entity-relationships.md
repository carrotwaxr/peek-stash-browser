# Entity Relationships

This document describes the data model relationships between Peek's cached entities. Understanding these relationships is essential for working with content filtering, queries, and the sync system.

---

## Entity Types

Peek mirrors Stash's entity model, caching entities locally in SQLite. This enables:

- **Performant queries** — No network round-trips to Stash for library browsing
- **Per-user features** — Content restrictions, hidden items, ratings, favorites, watch history
- **Offline resilience** — Library remains accessible if Stash is temporarily unavailable

| Entity | Stash Source | Peek Cache Table | Notes |
|--------|--------------|------------------|-------|
| Scene | Yes | `StashScene` | Primary content type |
| Performer | Yes | `StashPerformer` | |
| Studio | Yes | `StashStudio` | Has parent/child hierarchy |
| Tag | Yes | `StashTag` | Has parent/child DAG |
| Group | Yes | `StashGroup` | Has parent/child hierarchy (containing_groups/sub_groups) |
| Gallery | Yes | `StashGallery` | Contains Images |
| Image | Yes | `StashImage` | |
| Playlist | Peek-only | `Playlist` | User-created scene collections |
| SceneMarker | Yes | Not cached | Clips from Scenes (future feature) |

---

## Scene Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Studio | Many-to-One | — | `StashScene.studioId` |
| Performer | Many-to-Many | `ScenePerformer` | |
| Tag | Many-to-Many | `SceneTag` | |
| Group | Many-to-Many | `SceneGroup` | Includes `sceneIndex` for ordering |
| Gallery | Many-to-Many | `SceneGallery` | |

---

## Performer Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `ScenePerformer` | Inverse of Scene→Performer |
| Tag | Many-to-Many | `PerformerTag` | |
| Image | Many-to-Many | `ImagePerformer` | |
| Gallery | Many-to-Many | `GalleryPerformer` | |
| Group | — | — | Computed by Stash (performers appearing in group's scenes) |

---

## Studio Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | One-to-Many | — | Inverse of Scene→Studio |
| Tag | Many-to-Many | `StudioTag` | |
| Image | One-to-Many | — | `StashImage.studioId` |
| Gallery | One-to-Many | — | `StashGallery.studioId` |
| Parent Studio | Many-to-One | — | `StashStudio.parentId` |
| Child Studios | One-to-Many | — | Inverse of parentId |
| Group | — | — | Computed by Stash (groups with this studio) |

---

## Tag Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `SceneTag` | Inverse of Scene→Tag |
| Performer | Many-to-Many | `PerformerTag` | Inverse of Performer→Tag |
| Studio | Many-to-Many | `StudioTag` | Inverse of Studio→Tag |
| Group | Many-to-Many | `GroupTag` | Inverse of Group→Tag |
| Gallery | Many-to-Many | `GalleryTag` | Inverse of Gallery→Tag |
| Image | Many-to-Many | `ImageTag` | Inverse of Image→Tag |
| Parent Tags | Many-to-Many | — | `StashTag.parentIds` (JSON array) |
| Child Tags | Many-to-Many | — | Inverse, resolved at runtime |

!!! note "Tag Hierarchies"
    Tag hierarchies form a DAG (directed acyclic graph), not a tree. Tags can have multiple parents.

---

## Group Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `SceneGroup` | Includes `sceneIndex` for ordering |
| Tag | Many-to-Many | `GroupTag` | |
| Studio | Many-to-One | — | `StashGroup.studioId` |
| Containing Groups | Many-to-Many | — | Via Stash `containing_groups` |
| Sub Groups | Many-to-Many | — | Via Stash `sub_groups` |

---

## Gallery Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `SceneGallery` | Inverse of Scene→Gallery |
| Performer | Many-to-Many | `GalleryPerformer` | |
| Tag | Many-to-Many | `GalleryTag` | |
| Studio | Many-to-One | — | `StashGallery.studioId` |
| Image | One-to-Many | `ImageGallery` | |

---

## Image Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Gallery | Many-to-Many | `ImageGallery` | |
| Performer | Many-to-Many | `ImagePerformer` | |
| Tag | Many-to-Many | `ImageTag` | |
| Studio | Many-to-One | — | `StashImage.studioId` |

---

## Playlist Relationships (Peek-only)

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `PlaylistItem` | Includes `position` for ordering |
| User | Many-to-One | — | `Playlist.userId` |

---

## Metadata Inheritance

Peek pre-computes inherited metadata during sync to enable efficient filtering and consistent behavior.

### Scene Tag Inheritance

Scenes inherit tags from their associated performers, studio, and groups. This enables tag-based filtering to work transparently across all related entities.

**Inheritance sources:**

| Source | Description |
|--------|-------------|
| Performer Tags | Tags on any performer in the scene |
| Studio Tags | Tags on the scene's studio |
| Group Tags | Tags on any group the scene belongs to |

**Key rules:**

- **No duplication**: Tags already directly on the scene are not added to inherited tags
- **Deduplicated**: Same tag from multiple sources (e.g., two performers) appears once
- **Stored separately**: Inherited tags stored in `inheritedTagIds` field, not mixed with direct tags
- **When computed**: After every sync (full, incremental, or smart)

**Query behavior:**

When you filter scenes by tag, Peek searches both direct tags AND inherited tags. This means:

- Filtering by a performer's tag shows scenes with that performer
- Filtering by a studio's tag shows scenes from that studio
- Content restrictions on tags apply to inherited tags too

**Example:** If performer "Jane" has tag "Comedy", all scenes with Jane will match a "Comedy" tag filter, even if the scene itself isn't tagged "Comedy".

### Image Gallery Inheritance

Images inherit metadata from their parent gallery when the image's own field is empty. This ensures images in a gallery share consistent metadata without manual duplication.

**Inherited fields:**

| Field | Inheritance Rule |
|-------|------------------|
| Performers | Inherit if image has no performers |
| Tags | Inherit if image has no tags |
| Studio | Inherit if image has no studio |
| Date | Inherit if image has no date |
| Photographer | Inherit if image has no photographer |
| Details | Inherit if image has no details |

**Key rules:**

- **Never overwrites**: Only copies when image field is NULL/empty
- **All-or-nothing for relationships**: Performers and tags only inherit if image has NONE
- **Multi-gallery handling**: If image is in multiple galleries, uses first gallery (by ID)
- **When computed**: After every sync that touches images or galleries

!!! note
    Image `title` is NOT inherited — each image keeps its own name.

**Example:** A gallery has studio "Acme" and tags "Nature", "Landscape". An image in that gallery with no metadata will inherit all three. An image with its own studio but no tags will keep its studio and inherit the tags.

---

## Stash GraphQL Schema Reference

Key entity types from Stash for reference:

- **Scene**: `id`, `title`, `date`, `studio`, `performers[]`, `tags[]`, `groups[]`, `galleries[]`, `files[]` (contains `duration`)
- **Performer**: `id`, `name`, `tags[]`, `scene_count`, `image_count`, `gallery_count`, `group_count`
- **Studio**: `id`, `name`, `parent_studio`, `child_studios[]`, `tags[]`, `groups[]`
- **Tag**: `id`, `name`, `parents[]`, `children[]`, various `*_count` fields
- **Group**: `id`, `name`, `studio`, `tags[]`, `containing_groups[]`, `sub_groups[]`, `scenes[]`
- **Gallery**: `id`, `title`, `date`, `studio`, `performers[]`, `tags[]`, `scenes[]`, `image_count`, `photographer`, `details`
- **Image**: `id`, `title`, `date`, `studio`, `performers[]`, `tags[]`, `galleries[]`, `photographer`, `details`
- **SceneMarker**: `id`, `scene`, `primary_tag`, `tags[]`, `seconds`, `end_seconds`

---

*See also: [Technical Overview](../development/technical-overview.md) for architecture details, [Sync Architecture](../development/sync-architecture.md) for sync details*
