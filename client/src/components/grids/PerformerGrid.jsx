import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { PerformerCard } from "../cards/index.js";

/**
 * PerformerGrid - Grid for displaying performers with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
const PerformerGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No performers found",
  density = "medium",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="performer"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="o_counter"
      density={density}
      renderItem={(performer, _index, { onHideSuccess }) => (
        <PerformerCard
          key={performer.id}
          performer={performer}
          onHideSuccess={() => onHideSuccess(performer.id)}
        />
      )}
      {...rest}
    />
  );
};

export default PerformerGrid;
