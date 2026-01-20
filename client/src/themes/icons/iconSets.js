// Theme-based icon sets
// Each theme can have its own icon pack
//
// NOTE: Entity icons are defined in constants/entityIcons.js as the single source of truth.
// NOTE: App icons are defined in constants/appIcons.js for features, actions, etc.
// This file provides theme-specific overrides and can extend icons per theme.

import { ENTITY_ICON_NAMES } from "../../constants/entityIcons.js";
import { FEATURE_ICONS, ACTION_ICONS, NAV_ICONS, UI_ICONS, BRAND_ICONS } from "../../constants/appIcons.js";

const iconSets = {
  peek: {
    // Default "Peek" theme icons
    name: "peek",
    displayName: "Peek Default",
    icons: {
      // Entity icons (from entityIcons.js)
      scenes: ENTITY_ICON_NAMES.scene,
      performers: ENTITY_ICON_NAMES.performer,
      studios: ENTITY_ICON_NAMES.studio,
      tags: ENTITY_ICON_NAMES.tag,
      image: ENTITY_ICON_NAMES.image,

      // Feature icons (from appIcons.js)
      home: FEATURE_ICONS.home,
      settings: FEATURE_ICONS.settings,
      logout: FEATURE_ICONS.logout,
      help: FEATURE_ICONS.help,
      questionCircle: FEATURE_ICONS.questionCircle,
      history: FEATURE_ICONS.watchHistory,
      "bar-chart-3": FEATURE_ICONS.userStats,
      tv: FEATURE_ICONS.tvMode,
      "circle-user-round": FEATURE_ICONS.userMenu,

      // Action icons (from appIcons.js)
      play: ACTION_ICONS.play,
      pause: ACTION_ICONS.pause,
      edit: ACTION_ICONS.edit,
      delete: ACTION_ICONS.delete,
      favorite: ACTION_ICONS.favorite,
      check: ACTION_ICONS.check,

      // UI icons (from appIcons.js)
      menu: UI_ICONS.menu,
      close: ACTION_ICONS.close,
      search: UI_ICONS.search,
      filter: UI_ICONS.filter,
      info: UI_ICONS.info,
      wrench: UI_ICONS.tools,
      sort: NAV_ICONS.sort,

      // Navigation icons (from appIcons.js)
      arrowUp: NAV_ICONS.chevronUp,
      arrowDown: NAV_ICONS.chevronDown,
      arrowLeft: NAV_ICONS.chevronLeft,
      arrowRight: NAV_ICONS.chevronRight,

      // Media
      video: "video",

      // Brand icons (from appIcons.js)
      logo: BRAND_ICONS.logo,
      peek: BRAND_ICONS.peek,

      // Keep user for generic user icon (different from performer)
      user: "user",
    },
  },

  treasureMap: {
    // Pirate/Treasure Map theme icons (placeholder for future)
    name: "treasureMap",
    displayName: "Treasure Map",
    icons: {
      // These would map to pirate-themed alternatives
      home: "map",
      scenes: "compass",
      performers: "users", // Could be 'skull' or pirate-themed
      studios: "anchor",
      tags: "flag",
      // ... more pirate-themed mappings
      logo: "compass",
    },
  },
};

const getIconSet = (themeName) => {
  return iconSets[themeName] || iconSets.peek;
};

export const getIconName = (iconKey, themeName = "peek") => {
  const iconSet = getIconSet(themeName);
  return iconSet.icons[iconKey] || iconKey;
};
