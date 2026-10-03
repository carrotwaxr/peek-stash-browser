import { useNavigate } from "react-router-dom";
import type { ShortcutHandler } from "../contexts/shortcutDispatcher";
import { useShortcutScope } from "./useShortcutScope";

// g then a letter (both c and v go to collections, as in Stash)
const NAV_MAP: Readonly<Record<string, string>> = {
  s: "/scenes",
  r: "/recommended",
  p: "/performers",
  u: "/studios",
  t: "/tags",
  c: "/collections",
  v: "/collections",
  l: "/galleries",
  i: "/images",
  k: "/clips",
  y: "/playlists",
  z: "/settings",
};

/**
 * Global navigation shortcuts (Stash-style): press "g" then a letter within
 * 1 s to open a page.
 *
 * - g s → Scenes
 * - g r → Recommended
 * - g p → Performers
 * - g u → Studios
 * - g t → Tags
 * - g c or g v → Collections
 * - g l → Galleries
 * - g i → Images
 * - g k → Clips
 * - g y → Playlists
 * - g z → Settings
 *
 * A `global` scope: any page, player or dialog scope that maps the same key
 * goes first, and a lightbox or dialog hides it while open.
 */
export const useGlobalNavigation = () => {
  const navigate = useNavigate();

  const after: Record<string, ShortcutHandler> = {};
  for (const [key, path] of Object.entries(NAV_MAP)) {
    after[key] = () => void navigate(path);
  }

  useShortcutScope({ layer: "global", sequences: { g: after } });
};
