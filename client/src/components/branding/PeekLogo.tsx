import { useLocation, useNavigate } from "react-router-dom";
import { useUserSettings } from "../../api/hooks/useUserSettings";
import { getLandingPage } from "../../constants/navigation";

interface PeekLogoProps {
  size?: "small" | "default" | "large";
  variant?: "auto" | "active" | "inactive" | "text-only" | "icon-only";
}

export const PeekLogo = ({
  size = "default",
  variant = "auto",
}: PeekLogoProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useUserSettings();

  // Navigate to the user's landing page, from the settings query so a change
  // in Settings applies at once. Passes the current path so random mode
  // excludes the current page
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const destination = getLandingPage(
      data?.settings.landingPagePreference,
      location.pathname
    );
    void navigate(destination);
  };

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
    <a
      href="/"
      onClick={handleClick}
      className={`flex items-center ${config.container} hover:opacity-80 transition-opacity duration-200 cursor-pointer`}
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
    </a>
  );
};
