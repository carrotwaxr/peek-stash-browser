import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { GalleryCard } from "../cards/index.js";

/**
 * GalleryGrid - Grid for displaying galleries with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 */
const GalleryGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No galleries found",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="gallery"
      gridType="standard"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="date"
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
