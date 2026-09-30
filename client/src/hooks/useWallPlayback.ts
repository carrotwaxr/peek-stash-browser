import { useUserSettings } from "../api/hooks/useUserSettings";

export type WallPlayback = "autoplay" | "hover" | "static";

const WALL_PLAYBACK_MODES: readonly string[] = ["autoplay", "hover", "static"];

/**
 * The wall cog's Preview Behavior setting, offered by list pages in wall
 * view. `ContextSettings` saves it through the user-settings query.
 */
export const WALL_VIEW_SETTINGS = [
  {
    key: "wallPlayback" as const,
    label: "Preview Behavior",
    type: "select" as const,
    options: [
      { value: "autoplay", label: "Autoplay All" },
      { value: "hover", label: "Play on Hover" },
      { value: "static", label: "Static Thumbnails" },
    ],
  },
];

/**
 * The user's wall playback preference, read from the user-settings query:
 * a save anywhere (the wall cog, Settings) reaches every wall at once.
 */
export const useWallPlayback = () => {
  const { data, isPending } = useUserSettings();
  const stored = data?.settings.wallPlayback;
  const wallPlayback: WallPlayback =
    stored && WALL_PLAYBACK_MODES.includes(stored)
      ? (stored as WallPlayback)
      : "autoplay";
  return { wallPlayback, loading: isPending };
};
