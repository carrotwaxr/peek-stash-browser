// Example usage of themed icons throughout the app
import { ThemedIcon } from "./ThemedIcon.jsx";

// Navigation examples
export const NavigationIcons = () => (
  <div className="flex gap-4">
    <ThemedIcon name="home" size={20} />
    <ThemedIcon name="scenes" size={20} />
    <ThemedIcon name="performers" size={20} />
    <ThemedIcon name="studios" size={20} />
    <ThemedIcon name="tags" size={20} />
  </div>
);

// Action examples
export const ActionIcons = () => (
  <div className="flex gap-4">
    <ThemedIcon name="play" size={24} />
    <ThemedIcon name="edit" size={16} />
    <ThemedIcon name="delete" size={16} color="red" />
    <ThemedIcon name="favorite" size={16} color="gold" />
  </div>
);

// Interface examples
export const InterfaceIcons = () => (
  <div className="flex gap-4">
    <ThemedIcon name="search" size={18} />
    <ThemedIcon name="filter" size={18} />
    <ThemedIcon name="sort" size={18} />
    <ThemedIcon name="settings" size={20} />
  </div>
);
