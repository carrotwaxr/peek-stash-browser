/**
 * Filter preset contexts. A context names the page (or the tab of a detail
 * page) a user can save a default preset for. The server validates every
 * save and set-default against this list, and the client labels its
 * "set as default" text from it.
 */

export const PRESET_CONTEXTS = [
  "scene",
  "scene_performer",
  "scene_tag",
  "scene_studio",
  "scene_group",
  "scene_gallery",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "image_performer",
  "image_studio",
  "image_tag",
  "image_gallery",
  "clip",
] as const;

export type PresetContext = (typeof PRESET_CONTEXTS)[number];

export const PRESET_CONTEXT_LABELS: Record<PresetContext, string> = {
  scene: "All Scenes page",
  scene_performer: "Performer pages",
  scene_tag: "Tag pages",
  scene_studio: "Studio pages",
  scene_group: "Group pages",
  scene_gallery: "Gallery pages",
  performer: "Performers page",
  studio: "Studios page",
  tag: "Tags page",
  group: "Groups page",
  gallery: "Galleries page",
  image: "Images page",
  image_performer: "Performer pages (Images tab)",
  image_studio: "Studio pages (Images tab)",
  image_tag: "Tag pages (Images tab)",
  image_gallery: "Gallery pages (Images tab)",
  clip: "Clips page",
};

export function isPresetContext(value: unknown): value is PresetContext {
  return (
    typeof value === "string" &&
    (PRESET_CONTEXTS as readonly string[]).includes(value)
  );
}

/**
 * The artifact type whose saved presets a context uses: the scene presets
 * serve every `scene_*` tab and the image presets every `image_*` tab.
 */
export function presetArtifactType(context: string): string {
  if (context.startsWith("scene_")) return "scene";
  if (context.startsWith("image_")) return "image";
  return context;
}
