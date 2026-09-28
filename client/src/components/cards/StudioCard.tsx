import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedStudio } from "@peek/shared-types";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath, getFilteredListPath } from "../../utils/entityLinks";
import { BaseCard } from "../ui/BaseCard";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid";

interface Props {
  studio: NormalizedStudio;
  fromPageTitle?: string;
  tabIndex?: number;
  onHideSuccess?: (entityId: string, entityType: string) => void;
}

const StudioCard = forwardRef<HTMLDivElement, Props>(
  ({ studio, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const studioSettings = getSettings("studio");
    const { hasMultipleInstances } = useConfig();

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior("studio", "tags") === "rich" &&
        studio.tags?.length > 0 && (
          <TooltipEntityGrid
            entityType="tag"
            entities={studio.tags}
            title="Tags"
            parentInstanceId={studio.instanceId}
          />
        );

      const performersTooltip = getIndicatorBehavior("studio", "performers") ===
        "rich" &&
        (studio.performers?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="performer"
            entities={studio.performers}
            title="Performers"
            parentInstanceId={studio.instanceId}
            total={studio.relation_totals?.performers}
          />
        );

      const groupsTooltip = getIndicatorBehavior("studio", "groups") ===
        "rich" &&
        (studio.groups?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="group"
            entities={studio.groups}
            title="Collections"
            parentInstanceId={studio.instanceId}
            total={studio.relation_totals?.groups}
          />
        );

      const galleriesTooltip = getIndicatorBehavior("studio", "galleries") ===
        "rich" &&
        (studio.galleries?.length ?? 0) > 0 && (
          <TooltipEntityGrid
            entityType="gallery"
            entities={
              studio.galleries as React.ComponentProps<
                typeof TooltipEntityGrid
              >["entities"]
            }
            title="Galleries"
            parentInstanceId={studio.instanceId}
            total={studio.relation_totals?.galleries}
          />
        );

      // Each count opens its list through that page's studio filter
      const scenesLink = getFilteredListPath(
        "/scenes",
        "studios",
        studio,
        hasMultipleInstances
      );
      const imagesLink = getFilteredListPath(
        "/images",
        "studios",
        studio,
        hasMultipleInstances
      );

      return [
        { type: "PLAY_COUNT", count: studio.play_count },
        {
          type: "SCENES",
          count: studio.scene_count,
          onClick:
            studio.scene_count > 0 && scenesLink
              ? () => navigate(scenesLink)
              : undefined,
        },
        {
          type: "IMAGES",
          count: studio.image_count,
          onClick:
            studio.image_count > 0 && imagesLink
              ? () => navigate(imagesLink)
              : undefined,
        },
        {
          type: "GALLERIES",
          count:
            studio.relation_totals?.galleries ??
            studio.galleries?.length ??
            studio.gallery_count,
          tooltipContent: galleriesTooltip,
        },
        {
          type: "GROUPS",
          count:
            studio.relation_totals?.groups ??
            studio.groups?.length ??
            studio.group_count,
          tooltipContent: groupsTooltip,
        },
        {
          type: "PERFORMERS",
          count:
            studio.relation_totals?.performers ??
            studio.performers?.length ??
            studio.performer_count,
          tooltipContent: performersTooltip,
        },
        {
          type: "TAGS",
          count: studio.tags?.length || 0,
          tooltipContent: tagsTooltip,
        },
      ];
    }, [studio, navigate, hasMultipleInstances]);

    // Only show indicators if setting is enabled
    const indicatorsToShow = studioSettings.showRelationshipIndicators
      ? indicators
      : [];

    return (
      <BaseCard
        ref={ref}
        entityType="studio"
        imagePath={studio.image_path}
        title={studio.name}
        description={studio.details}
        linkTo={getEntityPath("studio", studio, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicatorsToShow}
        displayPreferences={{
          showDescription: studioSettings.showDescriptionOnCard as
            | boolean
            | undefined,
        }}
        ratingControlsProps={{
          entityId: studio.id,
          instanceId: studio.instanceId,
          initialRating: studio.rating100,
          initialFavorite: studio.favorite || false,
          initialOCounter: studio.o_counter,
          onHideSuccess,
          showRating: studioSettings.showRating as boolean | undefined,
          showFavorite: studioSettings.showFavorite as boolean | undefined,
          showOCounter: studioSettings.showOCounter as boolean | undefined,
          showMenu: studioSettings.showMenu as boolean | undefined,
        }}
        {...rest}
      />
    );
  }
);

StudioCard.displayName = "StudioCard";

export default StudioCard;
