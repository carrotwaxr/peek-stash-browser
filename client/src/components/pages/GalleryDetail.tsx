import { useCallback, useMemo, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { PerformerRef } from "@peek/shared-types";
import { Play } from "lucide-react";
import { useImageList, useRelationCounts } from "../../api/hooks";
import { useEntityDetail } from "../../api/hooks/useEntityDetail";
import type { LibrarySearchParams } from "../../api/library";
import { useConfig } from "../../contexts/ConfigContext";
import { formatDate } from "../../utils/date";
import { getEntityPath } from "../../utils/entityLinks";
import { galleryTitle } from "../../utils/gallery";
import { libraryListTotal } from "../../utils/listQuery";
import { switchTabParams } from "../../utils/urlParams";
import DetailCard from "../detail/DetailCard";
import DetailImagesTab, {
  type DetailImagesLightbox,
} from "../detail/DetailImagesTab";
import EntityDetailLayout from "../detail/EntityDetailLayout";
import EntityDetailPage, {
  type FoundEntityDetail,
} from "../detail/EntityDetailPage";
import {
  type DetailTabSpec,
  useDetailTabState,
} from "../detail/detailTabState";
import SceneSearch from "../scene-search/SceneSearch";
import { Button, TagChips } from "../ui/index";

const IMAGES_TOTAL = libraryListTotal("findImages");

/**
 * How many of the gallery's images the viewer sees: the Images list's total
 * for the gallery, asked for one row, so the header has it on every tab
 */
function useGalleryImageTotal(ref: string): number | undefined {
  const request = useMemo(
    (): LibrarySearchParams<"image"> => ({
      filter: { page: 1, per_page: 1, sort: "path", direction: "ASC" },
      image_filter: { galleries: { value: [ref], modifier: "INCLUDES" } },
    }),
    [ref]
  );
  const { data } = useImageList(request);
  return IMAGES_TOTAL.total(data) ?? undefined;
}

const GalleryPage = ({ detail }: { detail: FoundEntityDetail<"gallery"> }) => {
  const { entity: gallery, instanceId, ref } = detail;
  const { hasMultipleInstances } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const title = galleryTitle(gallery);
  const imageTotal = useGalleryImageTotal(ref);

  // Each tab's count is the total of its list, as the viewer sees it
  const counts = useRelationCounts("gallery", gallery.id, instanceId);
  const totals = counts.data?.counts;

  // The Images tab's viewer, while the tab is open. Play Slideshow on
  // another tab opens the Images tab, then its viewer once it is there.
  const viewer = useRef<DetailImagesLightbox | null>(null);
  const playOnOpen = useRef(false);
  const lightboxRef = useCallback((handle: DetailImagesLightbox | null) => {
    viewer.current = handle;
    if (handle && playOnOpen.current) {
      playOnOpen.current = false;
      handle.open(0, true);
    }
  }, []);

  const tabs: DetailTabSpec[] = [
    {
      id: "images",
      label: "Images",
      count: totals?.images,
      render: () => (
        <DetailImagesTab
          field="galleries"
          entityRef={ref}
          // The gallery's file order, on its wall
          defaultSort="path"
          defaultView="wall"
          emptyMessage="No images found in this gallery"
          fromPageTitle={title}
          lightboxRef={lightboxRef}
        />
      ),
    },
    {
      id: "scenes",
      label: "Scenes",
      count: totals?.scenes,
      render: () => (
        <SceneSearch
          context="scene_gallery"
          permanentFilters={{
            galleries: { value: [ref], modifier: "INCLUDES" },
          }}
          permanentFiltersMetadata={{ galleries: [{ id: ref, title }] }}
          title={`Scenes in ${title}`}
          fromPageTitle={title}
        />
      ),
    },
  ];
  const { defaultTab } = useDetailTabState(tabs, counts, "images");

  const playSlideshow = () => {
    if (viewer.current) {
      viewer.current.open(0, true);
      return;
    }
    playOnOpen.current = true;
    setSearchParams(switchTabParams(searchParams, "images", defaultTab));
  };

  const studio = gallery.studio;

  return (
    <EntityDetailLayout
      type="gallery"
      detail={detail}
      title={title}
      subtitle={
        <div className="flex flex-wrap gap-3 items-center text-base mt-2">
          {studio && (
            <>
              <Link
                to={getEntityPath("studio", studio, hasMultipleInstances)}
                className="hover:underline"
                style={{ color: "var(--accent-primary)" }}
              >
                {studio.name}
              </Link>
              <span>•</span>
            </>
          )}
          {!!imageTotal && (
            <span>
              {imageTotal} image{imageTotal !== 1 ? "s" : ""}
            </span>
          )}
          {!!gallery.date && (
            <>
              <span>•</span>
              <span>{formatDate(gallery.date)}</span>
            </>
          )}
          {!!gallery.photographer && (
            <>
              <span>•</span>
              <span>by {gallery.photographer}</span>
            </>
          )}
        </div>
      }
      actions={
        <Button
          variant="primary"
          icon={<Play size={20} />}
          onClick={playSlideshow}
          disabled={!imageTotal}
          title="Play Slideshow"
        >
          <span className="hidden sm:inline">Play Slideshow</span>
        </Button>
      }
      description={gallery.details}
      sections={
        (gallery.performers.length > 0 || gallery.tags.length > 0) && (
          <>
            {gallery.performers.length > 0 && (
              <DetailCard title="Performers">
                <PerformersRow performers={gallery.performers} />
              </DetailCard>
            )}
            {gallery.tags.length > 0 && (
              <DetailCard title="Tags">
                <TagChips tags={gallery.tags} />
              </DetailCard>
            )}
          </>
        )
      }
      tabs={tabs}
      counts={counts}
      fallbackTab="images"
      emptyText="This gallery has no content in Peek"
    />
  );
};

/** The gallery's performers at a glance: a scrolling row of portraits */
const PerformersRow = ({ performers }: { performers: PerformerRef[] }) => {
  const { hasMultipleInstances } = useConfig();
  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
      style={{ scrollbarWidth: "thin" }}
    >
      {performers.map((performer) => (
        <Link
          key={`${performer.id}:${performer.instanceId}`}
          to={getEntityPath("performer", performer, hasMultipleInstances)}
          className="flex flex-col items-center flex-shrink-0 group w-[120px]"
        >
          <div
            className="aspect-[2/3] rounded-lg overflow-hidden mb-2 w-full border-2 border-transparent group-hover:border-[var(--accent-primary)] transition-all"
            style={{ backgroundColor: "var(--border-color)" }}
          >
            {performer.image_path ? (
              <img
                src={performer.image_path}
                alt={performer.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span
                  className="text-4xl"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {performer.gender === "MALE" ? "♂" : "♀"}
                </span>
              </div>
            )}
          </div>
          <span
            className="text-xs font-medium text-center w-full line-clamp-2 group-hover:underline"
            style={{ color: "var(--text-primary)" }}
          >
            {performer.name}
          </span>
        </Link>
      ))}
    </div>
  );
};

const GalleryDetail = () => {
  const { galleryId } = useParams<{ galleryId: string }>();
  const [searchParams] = useSearchParams();
  const detail = useEntityDetail(
    "gallery",
    galleryId,
    searchParams.get("instance")
  );
  return (
    <EntityDetailPage type="gallery" detail={detail}>
      {(found) => <GalleryPage detail={found} />}
    </EntityDetailPage>
  );
};

export default GalleryDetail;
