import { SearchableGrid } from "../ui/SearchableGrid";
import { TagCard } from "../cards/index";

interface Props {
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  emptyMessage?: string;
  density?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const TagGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No tags found",
  density = "medium",
  ...rest
}: Props) => {
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
