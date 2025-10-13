// Theme-based icon sets
// Each theme can have its own icon pack

export const iconSets = {
  peek: {
    // Default "Peek" theme icons
    name: "peek",
    displayName: "Peek Default",
    icons: {
      // Navigation & UI
      home: "home",
      scenes: "play-circle",
      performers: "users",
      studios: "building",
      tags: "tag",
      search: "search",
      filter: "filter",
      sort: "arrow-up-down",

      // Actions
      play: "play",
      pause: "pause",
      edit: "edit",
      delete: "trash-2",
      favorite: "heart",
      check: "check",

      // Interface
      menu: "menu",
      close: "x",
      settings: "settings",
      user: "user",
      logout: "log-out",

      // Arrows & Navigation
      arrowUp: "chevron-up",
      arrowDown: "chevron-down",
      arrowLeft: "chevron-left",
      arrowRight: "chevron-right",

      // Media
      image: "image",
      video: "video",

      // Brand
      logo: "eye", // The "peek" eye icon
      peek: "eye-off", // Alternative peek icon
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

export const getIconSet = (themeName) => {
  return iconSets[themeName] || iconSets.peek;
};

export const getIconName = (iconKey, themeName = "peek") => {
  const iconSet = getIconSet(themeName);
  return iconSet.icons[iconKey] || iconKey;
};
