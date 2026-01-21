export interface SceneNfoInput {
  id: string;
  title?: string | null;
  details?: string | null;
  date?: string | null;
  rating100?: number | null;
  studioName?: string | null;
  performerNames: string[];
  tagNames: string[];
  fileName?: string;
}

function escapeXml(text: string | null | undefined): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateSceneNfo(scene: SceneNfoInput): string {
  const title = scene.title || scene.fileName || "Unknown";
  const details = scene.details || "";
  const date = scene.date || "";
  const year = date ? date.split("-")[0] : "";
  const studio = scene.studioName || "";

  let rating = "";
  let criticRating = "";
  if (scene.rating100 != null) {
    rating = String(Math.floor(scene.rating100 / 10));
    criticRating = String(scene.rating100);
  }

  // Build performers XML
  let performersXml = "";
  scene.performerNames.forEach((name, index) => {
    const escapedName = escapeXml(name);
    performersXml += `
    <actor>
        <name>${escapedName}</name>
        <role>${escapedName}</role>
        <order>${index}</order>
        <type>Actor</type>
    </actor>`;
  });

  // Build tags XML
  let tagsXml = "";
  scene.tagNames.forEach((tag) => {
    tagsXml += `
    <tag>${escapeXml(tag)}</tag>`;
  });

  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<movie>
    <name>${escapeXml(title)}</name>
    <title>${escapeXml(title)}</title>
    <originaltitle>${escapeXml(title)}</originaltitle>
    <sorttitle>${escapeXml(title)}</sorttitle>
    <criticrating>${criticRating}</criticrating>
    <rating>${rating}</rating>
    <userrating>${rating}</userrating>
    <plot><![CDATA[${details}]]></plot>
    <premiered>${date}</premiered>
    <releasedate>${date}</releasedate>
    <year>${year}</year>
    <studio>${escapeXml(studio)}</studio>${performersXml}
    <genre>Adult</genre>${tagsXml}
    <uniqueid type="stash">${scene.id}</uniqueid>
</movie>`;
}
