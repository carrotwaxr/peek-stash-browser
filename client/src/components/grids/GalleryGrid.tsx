import type { ComponentProps } from "react";
import { makeCompositeKey } from "../../utils/compositeKey";
import { GalleryCard } from "../cards/index";
import { SearchableGrid } from "../ui/SearchableGrid";

interface Props {
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  emptyMessage?: string;
  density?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const GalleryGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No galleries found",
  density = "medium",
  ...rest
}: Props) => {
  return (
    <SearchableGrid
      entityType="gallery"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="date"
      density={density}
      renderItem={(item, _index, { onHideSuccess }) => {
        const gallery = item as ComponentProps<typeof GalleryCard>["gallery"];
        return (
          <GalleryCard
            key={makeCompositeKey(gallery.id, gallery.instanceId)}
            gallery={gallery}
            onHideSuccess={onHideSuccess}
          />
        );
      }}
      {...rest}
    />
  );
};

export default GalleryGrid;
