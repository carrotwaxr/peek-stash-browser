import { SearchableGrid } from "../ui/SearchableGrid";
import { GalleryCard } from "../cards/index";

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
      renderItem={(gallery, _index, { onHideSuccess }) => (
        <GalleryCard
          key={gallery.id}
          gallery={gallery}
          onHideSuccess={() => onHideSuccess(gallery.id)}
        />
      )}
      {...rest}
    />
  );
};

export default GalleryGrid;
