import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * GroupCard - Card for displaying group/collection entities
 */
const GroupCard = forwardRef(
  ({ group, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    // Build subtitle from studio and date
    const subtitle = (() => {
      if (group.studio && group.date) {
        return `${group.studio.name} • ${group.date}`;
      } else if (group.studio) {
        return group.studio.name;
      } else if (group.date) {
        return group.date;
      }
      return null;
    })();

    const indicators = [
      {
        type: "SCENES",
        count: group.scene_count,
        onClick:
          group.scene_count > 0
            ? () => navigate(`/scenes?groupIds=${group.id}`)
            : undefined,
      },
      {
        type: "GROUPS",
        count: group.sub_group_count,
        onClick:
          group.sub_group_count > 0
            ? () => navigate(`/collections?groupIds=${group.id}`)
            : undefined,
      },
      {
        type: "PERFORMERS",
        count: group.performer_count,
        onClick:
          group.performer_count > 0
            ? () => navigate(`/performers?groupIds=${group.id}`)
            : undefined,
      },
      {
        type: "TAGS",
        count: group.tags?.length || 0,
        onClick:
          group.tags?.length > 0
            ? () => navigate(`/tags?groupIds=${group.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="group"
        imagePath={group.front_image_path || group.back_image_path}
        title={group.name}
        subtitle={subtitle}
        description={group.description}
        linkTo={`/collection/${group.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={{
          entityId: group.id,
          initialRating: group.rating100,
          initialFavorite: group.favorite || false,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

GroupCard.displayName = "GroupCard";

export default GroupCard;
