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
      renderItem={(image: any, _index: number, { onHideSuccess }: any) => (
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
