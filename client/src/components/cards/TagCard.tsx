import { forwardRef, memo } from "react";
import type { NormalizedTag } from "@peek/shared-types";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { BaseCard } from "../ui/BaseCard";
import { useCardIndicators } from "./cardIndicators";

interface Props {
  tag: NormalizedTag & { child_count?: number };
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
const TagCard = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ tag, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
      const { getSettings } = useCardDisplaySettings();
      const tagSettings = getSettings("tag");
      const { hasMultipleInstances } = useConfig();

      // Build subtitle from child count
      const subtitle =
        (tag.child_count ?? 0) > 0
          ? `${tag.child_count} subtag${tag.child_count !== 1 ? "s" : ""}`
          : null;

      // The counts, from the tag card's table
      const indicators = useCardIndicators("tag", tag);

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
          // A tag row without the viewer's data has no row and no menu
          ratingEntity={tag.rating100 !== undefined ? tag : undefined}
          ratingControlsProps={{ onHideSuccess }}
          {...rest}
        />
      );
    }
  )
);

TagCard.displayName = "TagCard";

export default TagCard;
