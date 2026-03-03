import * as LucideIcons from "lucide-react";
import { getIconName } from "../../themes/icons/iconSets";
import { useTheme } from "../../themes/useTheme";

// Theme-aware icon component that automatically uses the right icon for the current theme
interface ThemedIconProps {
  name: string;
  size?: number;
  className?: string;
  color?: string;
  [key: string]: unknown;
}

export const ThemedIcon = ({
  name,
  size = 20,
  className = "",
  color = "currentColor",
  ...props
}: ThemedIconProps) => {
  const { currentTheme } = useTheme();
  const iconName = getIconName(name, currentTheme);

  // Convert kebab-case to PascalCase for Lucide icon names
  const pascalCaseName = iconName
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  const LucideIcon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon | undefined>)[pascalCaseName];

  if (!LucideIcon) {
    return null;
  }

  return (
    <LucideIcon size={size} color={color} className={className} {...props} />
  );
};
