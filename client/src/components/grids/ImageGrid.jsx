import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { ImageCard } from "../cards/index.js";

/**
 * ImageGrid - Grid for displaying images with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 */
const ImageGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No images found",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="image"
      gridType="standard"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="date"
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
