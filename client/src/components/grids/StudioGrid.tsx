import { SearchableGrid } from "../ui/SearchableGrid";
import { StudioCard } from "../cards/index";

interface Props {
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  emptyMessage?: string;
  density?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const StudioGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No studios found",
  density = "medium",
  ...rest
}: Props) => {
  return (
    <SearchableGrid
      entityType="studio"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="name"
      density={density}
      renderItem={(studio, _index, { onHideSuccess }) => (
        <StudioCard
          key={studio.id}
          studio={studio}
          onHideSuccess={() => onHideSuccess(studio.id)}
        />
      )}
      {...rest}
    />
  );
};

export default StudioGrid;
