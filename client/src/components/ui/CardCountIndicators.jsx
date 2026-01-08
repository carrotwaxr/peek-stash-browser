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
    label: (count) => count === 1 ? "1 O" : `${count} O's`,
  },
  PLAY_COUNT: {
    icon: LucideEye,
    iconColor: hueify("var(--status-warning)", "lighter"),
    label: (count) => count === 1 ? "Viewed 1 time" : `Viewed ${count} times`,
  },
  PERFORMERS: {
    icon: LucideUser,
    iconColor: "var(--accent-primary)",
    label: (count) => count === 1 ? "1 performer" : `${count} performers`,
  },
  TAGS: {
    icon: LucideTag,
    iconColor: hueify("var(--status-info)", "darker"),
    label: (count) => count === 1 ? "1 tag" : `${count} tags`,
  },
  SCENES: {
    icon: LucideClapperboard,
    iconColor: hueify("var(--accent-secondary)", "lighter"),
    label: (count) => count === 1 ? "1 scene" : `${count} scenes`,
  },
  GROUPS: {
    icon: LucideFilm,
    iconColor: hueify("var(--accent-secondary)", "darker"),
    label: (count) => count === 1 ? "1 collection" : `${count} collections`,
  },
  IMAGES: {
    icon: LucideImages,
    iconColor: hueify("var(--status-success)", "lighter"),
    label: (count) => count === 1 ? "1 image" : `${count} images`,
  },
  GALLERIES: {
    icon: LucideGalleryVertical,
    iconColor: hueify("var(--status-success)", "darker"),
    label: (count) => count === 1 ? "1 gallery" : `${count} galleries`,
  },
  PLAYLISTS: {
    icon: LucideList,
    iconColor: hueify("var(--status-warning)", "darker"),
    label: (count) => count === 1 ? "1 playlist" : `${count} playlists`,
  },
  STUDIOS: {
    icon: LucideClapperboard,
    iconColor: hueify("var(--accent-secondary)", "lighter", 8),
    label: (count) => count === 1 ? "1 studio" : `${count} studios`,
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
            label={knownIndicatorProps.label}
            onClick={indicator.onClick}
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
  label = null,
  onClick = null,
}) => {
  const Icon = icon;

  const guts = (
    <div
      className={`flex items-center gap-1 hover:scale-110 transition-transform ${onClick ? 'cursor-pointer' : ''}`}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          e.preventDefault();
          onClick(e);
        }
      }}
    >
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

  // Use rich tooltipContent if provided, otherwise use simple label text
  const effectiveTooltip = tooltipContent || (label ? label(count) : null);
  // Disable hover for rich tooltips (React elements), keep hover for simple text
  const isRichTooltip = tooltipContent && typeof tooltipContent !== "string";

  return effectiveTooltip ? (
    <Tooltip
      content={effectiveTooltip}
      clickable={!!tooltipContent}
      hoverDisabled={isRichTooltip}
    >
      {guts}
    </Tooltip>
  ) : (
    guts
  );
};
