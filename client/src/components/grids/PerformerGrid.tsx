import type { ComponentProps } from "react";
import { PerformerCard } from "../cards/index";
import { SearchableGrid } from "../ui/SearchableGrid";

interface Props {
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  emptyMessage?: string;
  density?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const PerformerGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No performers found",
  density = "medium",
  ...rest
}: Props) => {
  return (
    <SearchableGrid
      entityType="performer"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="o_counter"
      density={density}
      renderItem={(item, _index, { onHideSuccess }) => {
        const performer = item as ComponentProps<
          typeof PerformerCard
        >["performer"];
        return (
          <PerformerCard
            key={performer.id}
            performer={performer}
            onHideSuccess={onHideSuccess}
          />
        );
      }}
      {...rest}
    />
  );
};

export default PerformerGrid;
