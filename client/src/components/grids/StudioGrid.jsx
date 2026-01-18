import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { StudioCard } from "../cards/index.js";

/**
 * StudioGrid - Grid for displaying studios with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
const StudioGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No studios found",
  density = "medium",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="studio"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="name"
      density={density}
      renderItem={(studio, _index, { onHideSuccess }) => (
        <StudioCard
          key={studio.id}
          studio={studio}
          onHideSuccess={() => onHideSuccess(studio.id)}
        />
      )}
      {...rest}
    />
  );
};

export default StudioGrid;
