import type { ComponentProps } from "react";
import { GroupCard } from "../cards/index";
import { SearchableGrid } from "../ui/SearchableGrid";

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
      renderItem={(item, _index, { onHideSuccess }) => {
        const group = item as ComponentProps<typeof GroupCard>["group"];
        return (
          <GroupCard
            key={group.id}
            group={group}
            onHideSuccess={onHideSuccess}
          />
        );
      }}
      {...rest}
    />
  );
};

export default GroupGrid;
