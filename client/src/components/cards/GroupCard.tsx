import { forwardRef, memo } from "react";
import type { NormalizedGroup } from "@peek/shared-types";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { BaseCard } from "../ui/BaseCard";
import { useCardIndicators } from "./cardIndicators";

interface Props {
  group: NormalizedGroup & {
    description?: string | null;
  };
  fromPageTitle?: string;
  tabIndex?: number;
  /** Called once the card's entity is hidden, with its instance */
  onHideSuccess?: (
    entityId: string,
    entityType: string,
    instanceId?: string
  ) => void;
}

// Memoised: a grid that renders again with the same row skips this card
const GroupCard = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ group, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
      const { getSettings } = useCardDisplaySettings();
      const groupSettings = getSettings("group");
      const { hasMultipleInstances } = useConfig();

      // Build subtitle from studio and date (respecting settings)
      const subtitle = (() => {
        const parts = [];

        if (groupSettings.showStudio && group.studio) {
          parts.push(group.studio.name);
        }

        if (groupSettings.showDate && group.date) {
          parts.push(group.date);
        }

        return parts.length > 0 ? parts.join(" • ") : null;
      })();

      // The counts, from the group card's table
      const indicators = useCardIndicators("group", group);

      // Only show indicators if setting is enabled
      const indicatorsToShow = groupSettings.showRelationshipIndicators
        ? indicators
        : [];

      return (
        <BaseCard
          ref={ref}
          entityType="group"
          imagePath={group.front_image_path || group.back_image_path}
          title={group.name}
          subtitle={subtitle}
          description={group.description}
          linkTo={getEntityPath("group", group, hasMultipleInstances)}
          fromPageTitle={fromPageTitle}
          tabIndex={tabIndex}
          indicators={indicatorsToShow}
          displayPreferences={{
            showDescription: groupSettings.showDescriptionOnCard as
              | boolean
              | undefined,
          }}
          ratingControlsProps={{
            entityId: group.id,
            instanceId: group.instanceId,
            initialRating: group.rating100,
            initialFavorite: group.favorite || false,
            onHideSuccess,
            showRating: groupSettings.showRating as boolean | undefined,
            showFavorite: groupSettings.showFavorite as boolean | undefined,
            showOCounter: groupSettings.showOCounter as boolean | undefined,
            showMenu: groupSettings.showMenu as boolean | undefined,
          }}
          {...rest}
        />
      );
    }
  )
);

GroupCard.displayName = "GroupCard";

export default GroupCard;
