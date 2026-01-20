import {
  LucideMars,
  LucideTransgender,
  LucideUser,
  LucideVenus,
} from "lucide-react";
import IntersexIcon from "./icons/IntersexIcon.jsx";
import NonBinaryIcon from "./icons/NonBinaryIcon.jsx";

/**
 * Reusable gender icon component supporting all Stash gender values
 * Follows inclusive design practices with colors inspired by pride flags
 *
 * Gender values supported:
 * - MALE: Mars symbol (blue)
 * - FEMALE: Venus symbol (pink)
 * - TRANSGENDER_MALE: Transgender symbol (light blue - trans flag)
 * - TRANSGENDER_FEMALE: Transgender symbol (light pink - trans flag)
 * - INTERSEX: Intersex symbol (yellow - intersex flag)
 * - NON_BINARY: Non-binary symbol (yellow - non-binary flag)
 *
 * @param {string} gender - Gender value from Stash
 * @param {number} size - Icon size in pixels (default: 24)
 * @param {string} className - Optional additional CSS classes
 */
const GenderIcon = ({ gender, size = 24, className = "" }) => {
  // Gender-specific colors based on traditional and pride flag colors
  const getGenderConfig = () => {
    switch (gender) {
      case "MALE":
        return {
          icon: LucideMars,
          color: "#0561fa", // Traditional blue
          label: "Male",
        };
      case "FEMALE":
        return {
          icon: LucideVenus,
          color: "#ff0080", // Traditional pink
          label: "Female",
        };
      case "TRANSGENDER_MALE":
        return {
          icon: LucideTransgender,
          color: "#5BCEFA", // Light blue from trans flag
          label: "Trans Male",
        };
      case "TRANSGENDER_FEMALE":
        return {
          icon: LucideTransgender,
          color: "#F5A9B8", // Light pink from trans flag
          label: "Trans Female",
        };
      case "INTERSEX":
        return {
          icon: IntersexIcon,
          color: "#FFD800", // Yellow from intersex flag
          label: "Intersex",
        };
      case "NON_BINARY":
        return {
          icon: NonBinaryIcon,
          color: "#FFF430", // Yellow from non-binary flag
          label: "Non-Binary",
        };
      default:
        // Fallback for unknown or null gender
        return {
          icon: LucideUser,
          color: "#6c757d", // Neutral gray
          label: "Unknown",
        };
    }
  };

  const config = getGenderConfig();
  const Icon = config.icon;

  return (
    <Icon
      size={size}
      color={config.color}
      className={className}
      aria-label={config.label}
      title={config.label}
    />
  );
};

export default GenderIcon;
