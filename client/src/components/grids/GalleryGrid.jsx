import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { GalleryCard } from "../cards/index.js";

/**
 * GalleryGrid - Grid for displaying galleries with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
const GalleryGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No galleries found",
  density = "medium",
  ...rest
}) => {
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
