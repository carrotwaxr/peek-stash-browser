import type { ComponentProps } from "react";
import { makeCompositeKey } from "../../utils/compositeKey";
import { StudioCard } from "../cards/index";
import { SearchableGrid } from "../ui/SearchableGrid";

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
      renderItem={(item, _index, { onHideSuccess }) => {
        const studio = item as ComponentProps<typeof StudioCard>["studio"];
        return (
          <StudioCard
            key={makeCompositeKey(studio.id, studio.instanceId)}
            studio={studio}
            onHideSuccess={onHideSuccess}
          />
        );
      }}
      {...rest}
    />
  );
};

export default StudioGrid;
