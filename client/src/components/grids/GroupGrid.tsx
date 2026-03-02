import { SearchableGrid } from "../ui/SearchableGrid";
import { GroupCard } from "../cards/index";

interface Props {
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  emptyMessage?: string;
  density?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const GroupGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No collections found",
  density = "medium",
  ...rest
}: Props) => {
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
