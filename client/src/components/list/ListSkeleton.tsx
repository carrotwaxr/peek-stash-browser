import { getGridClasses } from "../../constants/grids";

export type SkeletonAspect = "portrait" | "landscape" | "square";

const ASPECT_RATIOS: Record<SkeletonAspect, string> = {
  portrait: "2 / 3",
  landscape: "16 / 9",
  square: "1 / 1",
};

/** The most placeholders a loading page shows: two screens of cards at most */
const MAX_SKELETONS = 24;

interface Props {
  /** The page's per page: it shows that many, up to 24 */
  perPage: number;
  /** The card image's shape */
  aspect: SkeletonAspect;
  /** The height of the card's text and rating rows, in rem */
  heightRem: number;
  gridDensity: string;
}

/**
 * A loading list's placeholders, each the shape of the entity's card: its
 * image at the card's aspect ratio and its text rows below, in the page's
 * grid, so the page does not jump when the cards arrive.
 */
const ListSkeleton = ({ perPage, aspect, heightRem, gridDensity }: Props) => (
  <div
    className={getGridClasses("standard", gridDensity)}
    aria-busy="true"
    aria-label="Loading"
  >
    {Array.from({ length: Math.min(perPage, MAX_SKELETONS) }, (_, i) => (
      <div
        key={i}
        data-testid="list-skeleton"
        data-aspect={aspect}
        className="flex flex-col rounded-lg border p-2 animate-pulse"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div
          className="rounded-lg"
          style={{
            aspectRatio: ASPECT_RATIOS[aspect],
            backgroundColor: "var(--bg-tertiary)",
          }}
        />
        <div
          className="mt-3 rounded"
          style={{
            height: `${heightRem}rem`,
            backgroundColor: "var(--bg-tertiary)",
          }}
        />
      </div>
    ))}
  </div>
);

export default ListSkeleton;
