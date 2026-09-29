export interface SceneNfoInput {
  id: string;
  title?: string | null;
  details?: string | null;
  date?: string | null;
  rating100?: number | null;
  studioName?: string | null | undefined;
  performerNames: string[];
  tagNames: string[];
  fileName?: string;
}

/**
 * Characters XML 1.0 cannot hold, escaped or not: C0 controls other than
 * tab, LF and CR, and U+FFFE and U+FFFF. A parser rejects the whole file on
 * one of them, so they are dropped.
 */
// eslint-disable-next-line no-control-regex
const NOT_XML_CHAR = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

function escapeXml(text: string | null | undefined): string {
  if (text == null) return "";
  return text
    .replace(NOT_XML_CHAR, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A CDATA section holding `text` exactly: each "]]>" is split across two sections. */
function cdata(text: string): string {
  const safe = text
    .replace(NOT_XML_CHAR, "")
    .replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}

export function generateSceneNfo(scene: SceneNfoInput): string {
  const title = escapeXml(scene.title || scene.fileName || "Unknown");
  const details = scene.details || "";
  const date = scene.date || "";
  const year = escapeXml(date ? date.split("-")[0] : "");
  const studio = escapeXml(scene.studioName || "");
  const escapedDate = escapeXml(date);

  let rating = "";
  let criticRating = "";
  if (scene.rating100 != null) {
    rating = escapeXml(String(Math.floor(scene.rating100 / 10)));
    criticRating = escapeXml(String(scene.rating100));
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
    <name>${title}</name>
    <title>${title}</title>
    <originaltitle>${title}</originaltitle>
    <sorttitle>${title}</sorttitle>
    <criticrating>${criticRating}</criticrating>
    <rating>${rating}</rating>
    <userrating>${rating}</userrating>
    <plot>${cdata(details)}</plot>
    <premiered>${escapedDate}</premiered>
    <releasedate>${escapedDate}</releasedate>
    <year>${year}</year>
    <studio>${studio}</studio>${performersXml}
    <genre>Adult</genre>${tagsXml}
    <uniqueid type="stash">${escapeXml(scene.id)}</uniqueid>
</movie>`;
}
