/** The name a clip shows: its title, else its primary tag's name (as Stash names a marker), else "Untitled" */
export function clipTitle(clip: {
  title?: string | null;
  primaryTag?: { name: string } | null;
}): string {
  const own = clip.title?.trim();
  if (own) return own;
  const tagName = clip.primaryTag?.name;
  if (tagName) return tagName;
  return "Untitled";
}
