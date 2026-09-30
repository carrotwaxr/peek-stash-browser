import { forwardRef, memo } from "react";
import type { NormalizedPerformer } from "@peek/shared-types";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { BaseCard } from "../ui/BaseCard";
import GenderIcon from "../ui/GenderIcon";
import { useCardIndicators } from "./cardIndicators";

interface Props {
  performer: NormalizedPerformer;
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
const PerformerCard = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ performer, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
      const { getSettings } = useCardDisplaySettings();
      const performerSettings = getSettings("performer");
      const { hasMultipleInstances } = useConfig();

      // The counts, from the performer card's table
      const indicators = useCardIndicators("performer", performer);

      // Only show indicators if setting is enabled
      const indicatorsToShow = performerSettings.showRelationshipIndicators
        ? indicators
        : [];

      return (
        <BaseCard
          ref={ref}
          entityType="performer"
          imagePath={performer.image_path}
          title={
            <div className="flex items-center justify-center gap-2">
              {performer.name}
              <GenderIcon gender={performer.gender} size={16} />
            </div>
          }
          linkTo={getEntityPath("performer", performer, hasMultipleInstances)}
          fromPageTitle={fromPageTitle}
          tabIndex={tabIndex}
          description={performer.details}
          hideSubtitle
          indicators={indicatorsToShow}
          displayPreferences={{
            showDescription: performerSettings.showDescriptionOnCard as
              | boolean
              | undefined,
          }}
          ratingControlsProps={{
            entityId: performer.id,
            instanceId: performer.instanceId,
            // The title is JSX (name and gender icon), so name the performer
            entityTitle: performer.name,
            initialRating: performer.rating,
            initialFavorite: performer.favorite || false,
            initialOCounter: performer.o_counter,
            onHideSuccess,
            showRating: performerSettings.showRating as boolean | undefined,
            showFavorite: performerSettings.showFavorite as boolean | undefined,
            showOCounter: performerSettings.showOCounter as boolean | undefined,
            showMenu: performerSettings.showMenu as boolean | undefined,
          }}
          {...rest}
        />
      );
    }
  )
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
