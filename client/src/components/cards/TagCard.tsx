import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedTag } from "@peek/shared-types";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath, getFilteredListPath } from "../../utils/entityLinks";
import { BaseCard } from "../ui/BaseCard";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid";

interface Props {
  tag: NormalizedTag & { child_count?: number };
  fromPageTitle?: string;
  tabIndex?: number;
  onHideSuccess?: (entityId: string, entityType: string) => void;
}

const TagCard = forwardRef<HTMLDivElement, Props>(
  ({ tag, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const tagSettings = getSettings("tag");
    const { hasMultipleInstances } = useConfig();

    // Build subtitle from child count
    const subtitle =
      (tag.child_count ?? 0) > 0
        ? `${tag.child_count} subtag${tag.child_count !== 1 ? "s" : ""}`
        : null;

    const indicators = useMemo(() => {
      const performersTooltip = getIndicatorBehavior("tag", "performers") ===
        "rich" &&
        (tag.performers?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="performer"
            entities={tag.performers}
            title="Performers"
            parentInstanceId={tag.instanceId}
            total={tag.relation_totals?.performers}
          />
        );

      const studiosTooltip = getIndicatorBehavior("tag", "studios") ===
        "rich" &&
        (tag.studios?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="studio"
            entities={tag.studios}
            title="Studios"
            parentInstanceId={tag.instanceId}
            total={tag.relation_totals?.studios}
          />
        );

      const groupsTooltip = getIndicatorBehavior("tag", "groups") === "rich" &&
        (tag.groups?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="group"
            entities={tag.groups}
            title="Collections"
            parentInstanceId={tag.instanceId}
            total={tag.relation_totals?.groups}
          />
        );

      const galleriesTooltip = getIndicatorBehavior("tag", "galleries") ===
        "rich" &&
        (tag.galleries?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="gallery"
            entities={
              tag.galleries as React.ComponentProps<
                typeof TooltipEntityGrid
              >["entities"]
            }
            title="Galleries"
            parentInstanceId={tag.instanceId}
            total={tag.relation_totals?.galleries}
          />
        );

      // Each count opens its list through that page's tag filter
      const scenesLink = getFilteredListPath(
        "/scenes",
        "tags",
        tag,
        hasMultipleInstances
      );
      const imagesLink = getFilteredListPath(
        "/images",
        "tags",
        tag,
        hasMultipleInstances
      );

      return [
        { type: "PLAY_COUNT", count: tag.play_count },
        {
          type: "SCENES",
          count: tag.scene_count,
          onClick:
            tag.scene_count > 0 && scenesLink
              ? () => navigate(scenesLink)
              : undefined,
        },
        {
          type: "IMAGES",
          count: tag.image_count,
          onClick:
            tag.image_count > 0 && imagesLink
              ? () => navigate(imagesLink)
              : undefined,
        },
        {
          type: "GALLERIES",
          count:
            tag.relation_totals?.galleries ??
            tag.galleries?.length ??
            tag.gallery_count,
          tooltipContent: galleriesTooltip,
        },
        {
          type: "GROUPS",
          count:
            tag.relation_totals?.groups ??
            tag.groups?.length ??
            tag.group_count,
          tooltipContent: groupsTooltip,
        },
        {
          type: "STUDIOS",
          count:
            tag.relation_totals?.studios ??
            tag.studios?.length ??
            tag.studio_count,
          tooltipContent: studiosTooltip,
        },
        {
          type: "PERFORMERS",
          count:
            tag.relation_totals?.performers ??
            tag.performers?.length ??
            tag.performer_count,
          tooltipContent: performersTooltip,
        },
      ];
    }, [tag, navigate, hasMultipleInstances]);

    // Only show indicators if setting is enabled
    const indicatorsToShow = tagSettings.showRelationshipIndicators
      ? indicators
      : [];

    return (
      <BaseCard
        ref={ref}
        entityType="tag"
        imagePath={tag.image_path}
        title={tag.name}
        subtitle={subtitle}
        description={tag.description}
        linkTo={getEntityPath("tag", tag, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicatorsToShow}
        displayPreferences={{
          showDescription: tagSettings.showDescriptionOnCard as
            | boolean
            | undefined,
        }}
        ratingControlsProps={
          tag.rating100 !== undefined
            ? {
                entityId: tag.id,
                instanceId: tag.instanceId,
                initialRating: tag.rating100,
                initialFavorite: tag.favorite || false,
                initialOCounter: tag.o_counter,
                onHideSuccess,
                showRating: tagSettings.showRating as boolean | undefined,
                showFavorite: tagSettings.showFavorite as boolean | undefined,
                showOCounter: tagSettings.showOCounter as boolean | undefined,
                showMenu: tagSettings.showMenu as boolean | undefined,
              }
            : undefined
        }
        {...rest}
      />
    );
  }
);

TagCard.displayName = "TagCard";

export default TagCard;
