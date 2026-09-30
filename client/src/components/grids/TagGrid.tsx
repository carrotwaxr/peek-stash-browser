import type { ComponentProps } from "react";
import { TagCard } from "../cards/index";
import { SearchableGrid } from "../ui/SearchableGrid";

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
      renderItem={(item, _index, { onHideSuccess }) => {
        const tag = item as ComponentProps<typeof TagCard>["tag"];
        return (
          <TagCard
            key={tag.id}
            tag={tag}
            onHideSuccess={() => onHideSuccess(tag.id, tag.instanceId)}
          />
        );
      }}
      {...rest}
    />
  );
};

export default TagGrid;
