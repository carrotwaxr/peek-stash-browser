import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { GroupCard } from "../cards/index.js";

/**
 * GroupGrid - Grid for displaying groups/collections with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
const GroupGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No collections found",
  density = "medium",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="group"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="name"
      density={density}
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
