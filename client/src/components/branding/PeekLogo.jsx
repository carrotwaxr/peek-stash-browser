import { Link } from "react-router-dom";

// import { useTheme } from '../../themes/useTheme.js'; // Will be used for theme-specific logos

export const PeekLogo = ({
  size = "default", // 'small', 'default', 'large'
  variant = "auto", // 'auto', 'active', 'inactive', 'text-only', 'icon-only'
}) => {
  //const location = useLocation();
  // const { currentTheme } = useTheme(); // Will be used when we implement theme-specific logos

  //const isHome = location.pathname === "/";
  //const isActive = variant === "auto" ? isHome : variant === "active";

  // Size configurations
  const sizeConfig = {
    small: {
      container: "gap-2",
      logoHeight: "h-6", // 24px
      logoWidth: "w-auto",
    },
    default: {
      container: "gap-2",
      logoHeight: "h-8", // 32px
      logoWidth: "w-auto",
    },
    large: {
      container: "gap-3",
      logoHeight: "h-12", // 48px
      logoWidth: "w-auto",
    },
  };

  const config = sizeConfig[size];

  // Get logo image paths
  const getLogoPath = () => {
    const basePath = "/branding/logos";

    return `${basePath}/peek-logo.svg`;
  };

  const renderLogo = () => {
    if (variant === "text-only") {
      return (
        <span
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Peek
        </span>
      );
    }

    if (variant === "icon-only") {
      return (
        <img
          src={getLogoPath()}
          alt="Peek"
          className={`${config.logoHeight} ${config.logoWidth} object-contain`}
        />
      );
    }

    // Default: Full logo (no additional text since your logo includes the text)
    return (
      <img
        src={getLogoPath()}
        alt="Peek"
        className={`${config.logoHeight} ${config.logoWidth} object-contain`}
      />
    );
  };

  return (
    <Link
      to="/"
      className={`flex items-center ${config.container} hover:opacity-80 transition-opacity duration-200`}
    >
      {renderLogo()}
      <span
        className="text-3xl font-brand"
        style={{
          color: "var(--accent-primary)",
          fontFamily: "var(--font-brand)",
        }}
      >
        peek
      </span>
    </Link>
  );
};
