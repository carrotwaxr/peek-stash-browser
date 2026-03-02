import { SearchableGrid } from "../ui/SearchableGrid";
import { ImageCard } from "../cards/index";

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
      renderItem={(image, _index, { onHideSuccess }) => (
        <ImageCard
          key={image.id}
          image={image}
          onHideSuccess={() => onHideSuccess(image.id)}
        />
      )}
      {...rest}
    />
  );
};

export default ImageGrid;
