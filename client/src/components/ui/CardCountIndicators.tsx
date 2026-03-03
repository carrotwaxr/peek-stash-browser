import { type ReactNode } from "react";
import { type LucideIcon, Droplets, Eye } from "lucide-react";
import { ENTITY_ICONS } from "../../constants/entityIcons";
import Tooltip from "./Tooltip";

interface IndicatorItem {
  type: string;
  count: number;
  tooltipContent?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

interface CardCountIndicatorsProps {
  indicators: IndicatorItem[];
  showZeroCounts?: boolean;
  size?: number;
}

interface CardCountIndicatorProps {
  count: number;
  icon: LucideIcon;
  iconColor?: string;
  iconSize?: number;
  tooltipContent?: ReactNode;
  label?: ((count: number) => string) | null;
  onClick?: ((e: React.MouseEvent) => void) | null;
}

const hueify = (color: string, direction = "lighter", amount = 12) => {
  return `lch(from ${color} calc(l ${
    direction === "lighter" ? "+" : "-"
  } ${Math.abs(amount)}) c h)`;
};

const CARD_COUNT_INDICATOR_TYPES = {
  O_COUNTER: {
    icon: Droplets,
    iconColor: "var(--status-info)",
    label: (count: number) => count === 1 ? "1 O" : `${count} O's`,
  },
  PLAY_COUNT: {
    icon: Eye,
    iconColor: hueify("var(--status-warning)", "lighter"),
    label: (count: number) => count === 1 ? "Viewed 1 time" : `Viewed ${count} times`,
  },
  PERFORMERS: {
    icon: ENTITY_ICONS.performer,
    iconColor: "var(--accent-primary)",
    label: (count: number) => count === 1 ? "1 performer" : `${count} performers`,
  },
  TAGS: {
    icon: ENTITY_ICONS.tag,
    iconColor: hueify("var(--status-info)", "darker"),
    label: (count: number) => count === 1 ? "1 tag" : `${count} tags`,
  },
  SCENES: {
    icon: ENTITY_ICONS.scene,
    iconColor: hueify("var(--accent-secondary)", "lighter"),
    label: (count: number) => count === 1 ? "1 scene" : `${count} scenes`,
  },
  GROUPS: {
    icon: ENTITY_ICONS.group,
    iconColor: hueify("var(--accent-secondary)", "darker"),
    label: (count: number) => count === 1 ? "1 collection" : `${count} collections`,
  },
  IMAGES: {
    icon: ENTITY_ICONS.images,
    iconColor: hueify("var(--status-success)", "lighter"),
    label: (count: number) => count === 1 ? "1 image" : `${count} images`,
  },
  GALLERIES: {
    icon: ENTITY_ICONS.gallery,
    iconColor: hueify("var(--status-success)", "darker"),
    label: (count: number) => count === 1 ? "1 gallery" : `${count} galleries`,
  },
  PLAYLISTS: {
    icon: ENTITY_ICONS.playlist,
    iconColor: hueify("var(--status-warning)", "darker"),
    label: (count: number) => count === 1 ? "1 playlist" : `${count} playlists`,
  },
  STUDIOS: {
    icon: ENTITY_ICONS.studio,
    iconColor: hueify("var(--status-info)", "lighter"),
    label: (count: number) => count === 1 ? "1 studio" : `${count} studios`,
  },
} as const satisfies Record<string, { icon: LucideIcon; iconColor: string; label: (count: number) => string }>;

export const CardCountIndicators = ({
  indicators,
  showZeroCounts = false,
  size = 20,
}: CardCountIndicatorsProps) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {indicators.map((indicator, index) => {
        const knownIndicatorProps = CARD_COUNT_INDICATOR_TYPES[indicator.type as keyof typeof CARD_COUNT_INDICATOR_TYPES];
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
  tooltipContent = null,
  label = null,
  onClick = null,
}: CardCountIndicatorProps) => {
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
        className="flex items-center justify-center card-indicator-icon"
        style={{ color: iconColor }}
      >
        <Icon size={iconSize} />
      </span>
      <span
        className="card-indicator-text"
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
      hoverDisabled={!!isRichTooltip}
    >
      {guts}
    </Tooltip>
  ) : (
    guts
  );
};
