import { useMemo } from "react";
import {
  LucideClapperboard,
  LucideDroplets,
  LucideEye,
  LucideFilm,
  LucideGalleryVertical,
  LucideImages,
  LucideList,
  LucideTag,
  LucideUser,
} from "lucide-react";
import Tooltip from "./Tooltip";

const hueify = (color, direction = "lighter", amount = 12) => {
  return `lch(from ${color} calc(l ${
    direction === "lighter" ? "+" : "-"
  } ${Math.abs(amount)}) c h)`;
};

const CARD_COUNT_INDICATOR_TYPES = {
  O_COUNTER: {
    icon: LucideDroplets,
    iconColor: "var(--status-info)",
  },
  PLAY_COUNT: {
    icon: LucideEye,
    iconColor: hueify("var(--status-warning)", "lighter"),
  },
  PERFORMERS: {
    icon: LucideUser,
    iconColor: "var(--accent-primary)",
  },
  TAGS: {
    icon: LucideTag,
    iconColor: hueify("var(--status-info)", "darker"),
  },
  SCENES: {
    icon: LucideClapperboard,
    iconColor: hueify("var(--accent-secondary)", "lighter"),
  },
  GROUPS: {
    icon: LucideFilm,
    iconColor: hueify("var(--accent-secondary)", "darker"),
  },
  IMAGES: {
    icon: LucideImages,
    iconColor: hueify("var(--status-success)", "lighter"),
  },
  GALLERIES: {
    icon: LucideGalleryVertical,
    iconColor: hueify("var(--status-success)", "darker"),
  },
  PLAYLISTS: {
    icon: LucideList,
    iconColor: hueify("var(--status-warning)", "darker"),
  },
};

export const CardCountIndicators = ({
  indicators,
  showZeroCounts = false,
  size = 20,
}) => {
  const { textSize } = useMemo(() => {
    if (size <= 16) return { textSize: "xs" };
    if (size <= 20) return { textSize: "sm" };
    if (size <= 24) return { textSize: "base" };
    return { textSize: "lg" };
  }, [size]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {indicators.map((indicator, index) => {
        const knownIndicatorProps = CARD_COUNT_INDICATOR_TYPES[indicator.type];
        if (!knownIndicatorProps) return null;
        if ((!showZeroCounts && isNaN(indicator.count)) || indicator.count <= 0)
          return null;
        return (
          <CardCountIndicator
            key={index}
            count={indicator.count}
            icon={knownIndicatorProps.icon}
            iconColor={knownIndicatorProps.iconColor}
            iconSize={size}
            textSize={textSize}
            tooltipContent={indicator.tooltipContent}
          />
        );
      })}
    </div>
  );
};

const CardCountIndicator = ({
  count,
  icon,
  iconColor = "var(--accent-secondary)",
  iconSize = 20,
  textSize = "sm",
  tooltipContent = null,
}) => {
  const Icon = icon;

  const guts = (
    <div className="flex items-center gap-1">
      <span
        className="flex items-center justify-center"
        style={{ color: iconColor }}
      >
        <Icon size={iconSize} />
      </span>
      <span
        className={`text-${textSize}`}
        style={{ color: "var(--text-muted)" }}
      >
        {count}
      </span>
    </div>
  );

  return tooltipContent ? (
    <Tooltip content={tooltipContent} clickable={true}>
      {guts}
    </Tooltip>
  ) : (
    guts
  );
};
