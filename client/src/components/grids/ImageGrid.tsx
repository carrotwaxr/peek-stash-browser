import type { ComponentProps } from "react";
import { ImageCard } from "../cards/index";
import { SearchableGrid } from "../ui/SearchableGrid";

interface Props {
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  emptyMessage?: string;
  density?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const ImageGrid = ({
  lockedFilters,
  hideLockedFilters,
  emptyMessage = "No images found",
  density = "medium",
  ...rest
}: Props) => {
  return (
    <SearchableGrid
      entityType="image"
      lockedFilters={lockedFilters}
      hideLockedFilters={hideLockedFilters}
      emptyMessage={emptyMessage}
      defaultSort="date"
      density={density}
      renderItem={(item, _index, { onHideSuccess }) => {
        const image = item as ComponentProps<typeof ImageCard>["image"];
        return (
          <ImageCard
            key={image.id}
            image={image}
            onHideSuccess={() => onHideSuccess(image.id, image.instanceId)}
          />
        );
      }}
      {...rest}
    />
  );
};

export default ImageGrid;
