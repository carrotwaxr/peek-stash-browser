/**
 * Table column configuration for all entity types
 *
 * Each column definition includes:
 * - id: unique identifier (matches sort field where applicable)
 * - label: display name for header
 * - mandatory: if true, cannot be hidden (Title/Name columns)
 * - defaultVisible: shown by default when no user preference
 * - sortable: if true, clicking header sorts by this field
 * - width: Tailwind width class (w-XX or min-w-XX)
 */

export const SCENE_COLUMNS = [
  {
    id: "preview",
    label: "Preview",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-24",
  },
  {
    id: "title",
    label: "Title",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-xs",
  },
  {
    id: "date",
    label: "Date",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-28",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-32",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "duration",
    label: "Duration",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "resolution",
    label: "Resolution",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "w-28",
  },
  {
    id: "filesize",
    label: "File Size",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "play_count",
    label: "Play Count",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-28",
  },
  {
    id: "o_counter",
    label: "O Count",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "path",
    label: "Path",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "max-w-48",
  },
  {
    id: "created_at",
    label: "Created At",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-32",
  },
];

export const PERFORMER_COLUMNS = [
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-20",
  },
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-40",
  },
  {
    id: "gender",
    label: "Gender",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-24",
  },
  {
    id: "age",
    label: "Age",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-20",
  },
  {
    id: "country",
    label: "Country",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-28",
  },
  {
    id: "ethnicity",
    label: "Ethnicity",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-28",
  },
  {
    id: "scenes_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-24",
  },
  {
    id: "aliases",
    label: "Aliases",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "max-w-32",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "favorite",
    label: "Favorite",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "w-24",
  },
  {
    id: "o_counter",
    label: "O Count",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
];

export const STUDIO_COLUMNS = [
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-32",
  },
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-40",
  },
  {
    id: "parent_studio",
    label: "Parent Studio",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-36",
  },
  {
    id: "scenes_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-24",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "child_count",
    label: "Sub-studios",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "w-32",
  },
];

export const TAG_COLUMNS = [
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-20",
  },
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-40",
  },
  {
    id: "scenes_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-24",
  },
  {
    id: "performer_count",
    label: "Performers",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-28",
  },
  {
    id: "studio_count",
    label: "Studios",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-24",
  },
  {
    id: "image_count",
    label: "Images",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-24",
  },
  {
    id: "description",
    label: "Description",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "max-w-48",
  },
];

export const GALLERY_COLUMNS = [
  {
    id: "cover",
    label: "Cover",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-20",
  },
  {
    id: "title",
    label: "Title",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-xs",
  },
  {
    id: "date",
    label: "Date",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-28",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-32",
  },
  {
    id: "image_count",
    label: "Images",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-24",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "path",
    label: "Path",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "max-w-48",
  },
];

export const IMAGE_COLUMNS = [
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-20",
  },
  {
    id: "title",
    label: "Title",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-xs",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-32",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "resolution",
    label: "Resolution",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-28",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "filesize",
    label: "File Size",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "path",
    label: "Path",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "max-w-48",
  },
];

export const GROUP_COLUMNS = [
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-20",
  },
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "max-w-40",
  },
  {
    id: "date",
    label: "Date",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-28",
  },
  {
    id: "scene_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-24",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "max-w-40",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "max-w-32",
  },
  {
    id: "duration",
    label: "Duration",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-24",
  },
];

/**
 * Entity type to columns mapping
 */
const ENTITY_COLUMNS_MAP = {
  scene: SCENE_COLUMNS,
  scenes: SCENE_COLUMNS,
  performer: PERFORMER_COLUMNS,
  performers: PERFORMER_COLUMNS,
  studio: STUDIO_COLUMNS,
  studios: STUDIO_COLUMNS,
  tag: TAG_COLUMNS,
  tags: TAG_COLUMNS,
  gallery: GALLERY_COLUMNS,
  galleries: GALLERY_COLUMNS,
  image: IMAGE_COLUMNS,
  images: IMAGE_COLUMNS,
  group: GROUP_COLUMNS,
  groups: GROUP_COLUMNS,
};

/**
 * Mapping of column IDs to sort fields where they differ
 * Key: "entityType:columnId", Value: sort field
 */
const COLUMN_SORT_FIELD_OVERRIDES = {
  "performer:age": "birthdate",
  "performers:age": "birthdate",
};

/**
 * Get columns array for an entity type
 * @param {string} entityType - The entity type (scene, performer, studio, tag, gallery, image, group)
 * @returns {Array} Array of column definitions
 */
export function getColumnsForEntity(entityType) {
  const normalizedType = entityType?.toLowerCase();
  return ENTITY_COLUMNS_MAP[normalizedType] ?? [];
}

/**
 * Get array of column IDs that are visible by default
 * @param {string} entityType - The entity type
 * @returns {Array<string>} Array of column IDs
 */
export function getDefaultVisibleColumns(entityType) {
  const columns = getColumnsForEntity(entityType);
  return columns.filter((col) => col.defaultVisible).map((col) => col.id);
}

/**
 * Get array of all column IDs in their default order
 * @param {string} entityType - The entity type
 * @returns {Array<string>} Array of column IDs
 */
export function getDefaultColumnOrder(entityType) {
  const columns = getColumnsForEntity(entityType);
  return columns.map((col) => col.id);
}

/**
 * Get the sort field for a column (some columns map to different sort fields)
 * @param {string} columnId - The column ID
 * @param {string} entityType - The entity type
 * @returns {string} The sort field to use
 */
export function getColumnSortField(columnId, entityType) {
  const normalizedType = entityType?.toLowerCase();
  const overrideKey = `${normalizedType}:${columnId}`;

  if (COLUMN_SORT_FIELD_OVERRIDES[overrideKey]) {
    return COLUMN_SORT_FIELD_OVERRIDES[overrideKey];
  }

  return columnId;
}
