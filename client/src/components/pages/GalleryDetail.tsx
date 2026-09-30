import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { NormalizedImage, TagRef } from "@peek/shared-types";
import { ArrowLeft, Play } from "lucide-react";
import { libraryApi } from "../../api";
import { useRelationCounts } from "../../api/hooks";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { useEntityLookup } from "../../hooks/useEntityLookup";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  type PageChangeOptions,
  usePaginatedLightbox,
} from "../../hooks/usePaginatedLightbox";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import { galleryTitle } from "../../utils/gallery";
import SceneSearch from "../scene-search/SceneSearch";
import RelationCountsError from "../ui/RelationCountsError";
import { TAB_COUNT_LOADING } from "../ui/TabNavigation";
import ViewInStashButton from "../ui/ViewInStashButton";
import {
  Button,
  EntityNotFound,
  FavoriteButton,
  LibraryInitializingBanner,
  Lightbox,
  LoadingSpinner,
  PageHeader,
  Pagination,
  RatingSlider,
  TabNavigation,
  TagChips,
} from "../ui/index";
import WallView from "../wall/WallView";

interface EntityRef {
  id: string;
  name?: string;
  instanceId?: string;
  image_path?: string;
  gender?: string;
  [key: string]: unknown;
}

const PER_PAGE = 100;

const GalleryDetail = () => {
  const { galleryId } = useParams<{ galleryId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [images, setImages] = useState<NormalizedImage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [rating, setRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Card display settings
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings("gallery");

  // Get multi-instance config
  const { hasMultipleInstances } = useConfig();

  // Get instance from URL query param for multi-stash support
  const instanceId = searchParams.get("instance");

  const lookup = useEntityLookup(
    libraryApi.findGalleryById,
    galleryId,
    instanceId
  );
  const gallery = lookup.entity ?? null;
  const isLoading = lookup.status === "loading";

  // Reads, tab filters and counts use the loaded gallery's own server: a
  // bare-id link names none, so nothing is read until the gallery is
  const galleryInstanceId = gallery?.instanceId as string | undefined;

  // Each tab's count is the total of its list, as the viewer sees it; the
  // tabs show no badge and none opens until the counts answer
  const {
    data: countsData,
    error: countsError,
    refetch: refetchCounts,
  } = useRelationCounts("gallery", galleryId, galleryInstanceId);
  const counts = countsData?.counts;
  const contentTabs = [
    { id: "images", label: "Images", count: counts?.images },
    { id: "scenes", label: "Scenes", count: counts?.scenes },
  ].map((t) => ({ ...t, count: t.count ?? TAB_COUNT_LOADING }));
  // The first tab with content, once the counts are in
  const effectiveDefaultTab = counts
    ? (contentTabs.find((t) => t.count > 0)?.id ?? "images")
    : "";

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get("tab") || effectiveDefaultTab;

  // URL-based page state for image pagination
  const urlPage = parseInt(searchParams.get("page") || "1") || 1;

  // Keeps the tab and the open image; a page turned from the lightbox
  // replaces the entry
  const handleImagePageChange = useCallback(
    (newPage: number, options?: PageChangeOptions) => {
      const params = new URLSearchParams(searchParams);
      if (newPage === 1) {
        params.delete("page");
      } else {
        params.set("page", String(newPage));
      }
      setSearchParams(params, { replace: options?.replace === true });
    },
    [searchParams, setSearchParams]
  );

  // Fetch function for prefetching adjacent pages
  const fetchPage = useCallback(
    async (page: number) => {
      if (!galleryId || !galleryInstanceId) return { images: [] };
      const { images } = await libraryApi.findGalleryImages(
        galleryId,
        galleryInstanceId,
        { page, perPage: PER_PAGE }
      );
      return { images };
    },
    [galleryId, galleryInstanceId]
  );

  // Paginated lightbox state and handlers. The open image is in the URL
  // (each image's own "id:instanceId"); an address naming one opens it once
  // the gallery and its page have loaded.
  const lightbox = usePaginatedLightbox({
    perPage: PER_PAGE,
    totalCount,
    externalPage: urlPage,
    onExternalPageChange: handleImagePageChange,
    fetchPage,
    images,
    ready: galleryInstanceId !== undefined && !imagesLoading,
  });

  // Set page title to gallery name
  usePageTitle(gallery ? galleryTitle(gallery) : "Gallery");

  // The rating and favorite controls start from each loaded gallery's,
  // set while rendering so they never show the previous one's
  const [controlsFor, setControlsFor] = useState(gallery);
  if (controlsFor !== gallery) {
    setControlsFor(gallery);
    setRating((gallery?.rating as number | null | undefined) ?? null);
    setIsFavorite(gallery?.favorite === true);
  }

  useEffect(() => {
    // Waits for the gallery, whose own server the images are asked on
    if (!galleryId || !galleryInstanceId) return;
    // A page asked for before the latest answers too late to be shown
    let latest = true;
    const fetchImages = async () => {
      try {
        setImagesLoading(true);
        const data = await libraryApi.findGalleryImages(
          galleryId,
          galleryInstanceId,
          { page: lightbox.currentPage, perPage: PER_PAGE }
        );
        if (!latest) return;
        setImages(data.images);
        setTotalCount(data.count);

        // Handle pending lightbox navigation after page loads
        lightbox.consumePendingLightboxIndex();
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        if (latest) setImagesLoading(false);
      }
    };

    void fetchImages();
    return () => {
      latest = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, galleryInstanceId, lightbox.currentPage]);

  const handleRatingChange = async (newRating: number | null) => {
    // Write on the loaded gallery's own server: a bare-id link names none
    const entityInstanceId = gallery?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setRating(newRating);
    try {
      await libraryApi.updateRating(
        "gallery",
        galleryId!,
        newRating,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating((gallery?.rating as number | null) ?? null);
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    // Write on the loaded gallery's own server: a bare-id link names none
    const entityInstanceId = gallery?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(
        "gallery",
        galleryId!,
        newValue,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite((gallery?.favorite as boolean) || false);
    }
  };

  const toggleFavorite = () => {
    void handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!gallery,
    setRating: (newRating) => void handleRatingChange(newRating),
    toggleFavorite,
  });

  // No longer using sidebar - all content moved to main header area

  if (lookup.status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <LibraryInitializingBanner />
        <LoadingSpinner />
      </div>
    );
  }

  // Found always carries the gallery; the second check narrows it for below
  if (lookup.status !== "found" || !gallery) {
    return (
      <EntityNotFound
        entityType="gallery"
        status={lookup.status === "found" ? "notFound" : lookup.status}
        matches={lookup.matches}
        error={lookup.error}
        onRetry={lookup.retry}
      />
    );
  }

  const performers = gallery.performers as EntityRef[] | undefined;
  const tags = gallery.tags as TagRef[] | undefined;
  const studioRef = gallery.studio as EntityRef | undefined;

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8 py-6">
      <div className="max-w-none">
        {/* Back Button and Play Slideshow Button */}
        <div className="flex items-center justify-between mb-4">
          <Button
            onClick={goBack}
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title={backButtonText}
          >
            <span className="hidden sm:inline">{backButtonText}</span>
          </Button>

          <Button
            variant="primary"
            icon={<Play size={20} />}
            onClick={() => lightbox.openLightbox(0, true)}
            disabled={images.length === 0}
            title="Play Slideshow"
          >
            <span className="hidden sm:inline">Play Slideshow</span>
          </Button>
        </div>

        {/* Header */}
        <div className="mb-6">
          <PageHeader
            title={
              (
                <div className="flex flex-wrap gap-3 items-center">
                  <span>{galleryTitle(gallery) as React.ReactNode}</span>
                  {!!settings.showFavorite && (
                    <FavoriteButton
                      isFavorite={isFavorite}
                      onChange={(newValue) =>
                        void handleFavoriteChange(newValue)
                      }
                      size="large"
                    />
                  )}
                  <ViewInStashButton
                    stashUrl={gallery?.stashUrl as string}
                    size={24}
                  />
                </div>
              ) as unknown as string
            }
            subtitle={
              (
                <div className="flex flex-wrap gap-3 items-center text-base mt-2">
                  {studioRef && (
                    <>
                      <Link
                        to={getEntityPath(
                          "studio",
                          studioRef,
                          hasMultipleInstances
                        )}
                        className="hover:underline"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        {studioRef.name}
                      </Link>
                      <span>•</span>
                    </>
                  )}
                  {totalCount > 0 && (
                    <span>
                      {totalCount} image{totalCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {!!gallery.date && (
                    <>
                      <span>•</span>
                      <span>
                        {new Date(gallery.date as string).toLocaleDateString()}
                      </span>
                    </>
                  )}
                  {!!gallery.photographer && (
                    <>
                      <span>•</span>
                      <span>by {gallery.photographer as React.ReactNode}</span>
                    </>
                  )}
                </div>
              ) as React.ReactNode
            }
          />

          {/* Rating Slider */}
          {!!settings.showRating && (
            <div className="mt-4 max-w-md">
              <RatingSlider
                rating={rating}
                onChange={(newRating) => void handleRatingChange(newRating)}
                showClearButton={true}
              />
            </div>
          )}

          {/* Details */}
          {!!settings.showDescriptionOnDetail && !!gallery.details && (
            <div className="mt-6">
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Details
              </h3>
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: "var(--text-primary)" }}
              >
                {gallery.details as React.ReactNode}
              </p>
            </div>
          )}

          {/* Performers Row (kept for at-a-glance importance) */}
          {performers && performers.length > 0 && (
            <div className="mt-6">
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Performers
              </h3>
              <div
                className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
                style={{ scrollbarWidth: "thin" }}
              >
                {performers.map((performer: EntityRef) => (
                  <Link
                    key={performer.id}
                    to={getEntityPath(
                      "performer",
                      performer,
                      hasMultipleInstances
                    )}
                    className="flex flex-col items-center flex-shrink-0 group w-[120px]"
                  >
                    <div
                      className="aspect-[2/3] rounded-lg overflow-hidden mb-2 w-full border-2 border-transparent group-hover:border-[var(--accent-primary)] transition-all"
                      style={{
                        backgroundColor: "var(--border-color)",
                      }}
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
            </div>
          )}

          {/* Tags Row */}
          {tags && tags.length > 0 && (
            <div className="mt-6">
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Tags
              </h3>
              <TagChips tags={tags} />
            </div>
          )}
        </div>

        {/* Tabbed Content Section */}
        <div className="mb-6">
          {counts && contentTabs.every((t) => t.count === 0) ? (
            <div
              className="py-16 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              This gallery has no content in Peek
            </div>
          ) : (
            <>
              <TabNavigation
                tabs={contentTabs}
                defaultTab={effectiveDefaultTab}
              />
              <RelationCountsError
                error={counts ? null : countsError}
                onRetry={() => void refetchCounts()}
              />

              {/* Images Tab */}
              {activeTab === "images" && (
                <div className="mt-6">
                  {/* Pagination - Top */}
                  {lightbox.totalPages > 1 && (
                    <div className="mb-4">
                      <Pagination
                        currentPage={lightbox.currentPage}
                        totalPages={lightbox.totalPages}
                        onPageChange={lightbox.setCurrentPage}
                      />
                    </div>
                  )}

                  <WallView
                    items={images as unknown as Record<string, unknown>[]}
                    entityType="image"
                    zoomLevel="medium"
                    onItemClick={(image: Record<string, unknown>) => {
                      const index = images.findIndex(
                        (img) => img.id === image.id
                      );
                      lightbox.openLightbox(index >= 0 ? index : 0);
                    }}
                    loading={imagesLoading}
                    emptyMessage="No images found in this gallery"
                  />

                  {/* Pagination - Bottom */}
                  {lightbox.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={lightbox.currentPage}
                        totalPages={lightbox.totalPages}
                        onPageChange={lightbox.setCurrentPage}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Scenes Tab */}
              {activeTab === "scenes" && (
                <SceneSearch
                  context="gallery_scenes"
                  permanentFilters={{
                    galleries: {
                      value: [
                        makeCompositeKey(galleryId ?? "", galleryInstanceId),
                      ],
                      modifier: "INCLUDES",
                    },
                  }}
                  permanentFiltersMetadata={{
                    galleries: [
                      {
                        id: makeCompositeKey(
                          galleryId ?? "",
                          galleryInstanceId
                        ),
                        title: galleryTitle(gallery),
                      },
                    ],
                  }}
                  title={`Scenes in ${galleryTitle(gallery)}`}
                  fromPageTitle={galleryTitle(gallery) || "Gallery"}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Lightbox
        images={images}
        initialIndex={lightbox.lightboxIndex}
        isOpen={lightbox.lightboxOpen}
        autoPlay={lightbox.lightboxAutoPlay}
        onClose={lightbox.closeLightbox}
        onImagesUpdate={setImages as (images: NormalizedImage[]) => void}
        onPageBoundary={lightbox.onPageBoundary}
        totalCount={totalCount}
        pageOffset={lightbox.pageOffset}
        onIndexChange={lightbox.onIndexChange}
        isPageTransitioning={lightbox.isPageTransitioning}
        transitionKey={lightbox.transitionKey}
        prefetchImages={lightbox.prefetchImages}
      />
    </div>
  );
};

export default GalleryDetail;
