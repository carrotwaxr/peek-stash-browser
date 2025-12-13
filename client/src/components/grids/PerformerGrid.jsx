import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { PerformerCard } from "../cards/index.js";

/**
 * PerformerGrid - Grid for displaying performers with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 */
const PerformerGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No performers found",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="performer"
      gridType="standard"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="o_counter"
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
