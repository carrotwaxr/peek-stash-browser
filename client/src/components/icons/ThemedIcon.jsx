import * as LucideIcons from "lucide-react";
import { getIconName } from "../../themes/icons/iconSets.js";
import { useTheme } from "../../themes/useTheme.js";

// Theme-aware icon component that automatically uses the right icon for the current theme
export const ThemedIcon = ({
  name,
  size = 20,
  className = "",
  color = "currentColor",
  ...props
}) => {
  const { currentTheme } = useTheme();
  const iconName = getIconName(name, currentTheme);

  // Convert kebab-case to PascalCase for Lucide icon names
  const pascalCaseName = iconName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  const LucideIcon = LucideIcons[pascalCaseName];

  if (!LucideIcon) {
    return null;
  }

  return (
    <LucideIcon size={size} color={color} className={className} {...props} />
  );
};
