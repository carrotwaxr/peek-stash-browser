import { SearchableGrid } from "../ui/SearchableGrid";
import { PerformerCard } from "../cards/index";

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
      renderItem={(performer: any, _index: number, { onHideSuccess }: any) => (
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
