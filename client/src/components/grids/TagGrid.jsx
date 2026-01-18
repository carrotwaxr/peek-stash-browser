import { SearchableGrid } from "../ui/SearchableGrid.jsx";
import { TagCard } from "../cards/index.js";

/**
 * TagGrid - Grid for displaying tags with search and filtering
 *
 * @param {Object} [props.lockedFilters] - Filters locked for nested grid use
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
const TagGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No tags found",
  density = "medium",
  ...rest
}) => {
  return (
    <SearchableGrid
      entityType="tag"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="name"
      density={density}
      renderItem={(tag, _index, { onHideSuccess }) => (
        <TagCard
          key={tag.id}
          tag={tag}
          onHideSuccess={() => onHideSuccess(tag.id)}
        />
      )}
      {...rest}
    />
  );
};

export default TagGrid;
