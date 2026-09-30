import { forwardRef, memo } from "react";
import type { NormalizedStudio } from "@peek/shared-types";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { BaseCard } from "../ui/BaseCard";
import { useCardIndicators } from "./cardIndicators";

interface Props {
  studio: NormalizedStudio;
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
const StudioCard = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ studio, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
      const { getSettings } = useCardDisplaySettings();
      const studioSettings = getSettings("studio");
      const { hasMultipleInstances } = useConfig();

      // The counts, from the studio card's table
      const indicators = useCardIndicators("studio", studio);

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
  )
);

StudioCard.displayName = "StudioCard";

export default StudioCard;
