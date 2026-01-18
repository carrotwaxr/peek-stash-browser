import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { ImageCard } from "../cards/index.js";

/**
 * ImageGrid - Grid for displaying images with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
const ImageGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No images found",
  density = "medium",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="image"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="date"
      density={density}
      renderItem={(image, _index, { onHideSuccess }) => (
        <ImageCard
          key={image.id}
          image={image}
          onHideSuccess={() => onHideSuccess(image.id)}
        />
      )}
      {...rest}
    />
  );
};

export default ImageGrid;
