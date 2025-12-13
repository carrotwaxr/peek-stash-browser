import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { GroupCard } from "../cards/index.js";

/**
 * GroupGrid - Grid for displaying groups/collections with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 */
const GroupGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No collections found",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="group"
      gridType="standard"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="name"
      renderItem={(group, _index, { onHideSuccess }) => (
        <GroupCard
          key={group.id}
          group={group}
          onHideSuccess={() => onHideSuccess(group.id)}
        />
      )}
      {...rest}
    />
  );
};

export default GroupGrid;
