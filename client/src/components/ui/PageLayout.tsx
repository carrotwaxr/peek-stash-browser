import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  fullHeight?: boolean;
}

/**
 * PageLayout component - Provides consistent page wrapper with minimal padding
 * Follows Plex/Jellyfin pattern: minimal edge spacing, let content flow naturally
 */
const PageLayout = ({ children, className = "", fullHeight = false }: Props) => {
  return (
    <div
      className={`w-full py-3 pb-6 sm:py-8 px-3 sm:px-4 ${fullHeight ? "min-h-screen" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

export default PageLayout;
