import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { getClips } from "../../services/api.js";
import {
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import ClipGrid from "./ClipGrid.jsx";

/**
 * ClipSearch - Search component for clips
 * Uses SearchControls for consistent UI with other entity search pages
 */
const ClipSearch = ({
  context = "clip",
  initialSort = "stashCreatedAt",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
  fromPageTitle,
  syncToUrl = true,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data, isLoading, error, execute } = useCancellableQuery();

  // Track effective perPage from SearchControls state
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );

  const currentClips = data?.clips || [];
  const totalCount = data?.total || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  /**
   * Handle query changes from SearchControls
   * Converts the GraphQL-style query to Peek REST API params
   */
  const handleQueryChange = useCallback(
    (query) => {
      execute(async () => {
        // Extract filter values from the clip_filter
        const clipFilter = query.clip_filter || {};

        // Build API params
        const params = {
          page: query.filter?.page || 1,
          perPage: query.filter?.per_page || 24,
          sortBy: query.filter?.sort || "stashCreatedAt",
          sortDir: query.filter?.direction?.toLowerCase() || "desc",
          q: query.filter?.q || undefined,
        };

        // Handle isGenerated filter
        if (clipFilter.isGenerated !== undefined) {
          params.isGenerated = clipFilter.isGenerated;
        }

        // Handle tag IDs filter
        if (clipFilter.tagIds && clipFilter.tagIds.length > 0) {
          params.tagIds = clipFilter.tagIds;
        }

        // Handle scene tag IDs filter
        if (clipFilter.sceneTagIds && clipFilter.sceneTagIds.length > 0) {
          params.sceneTagIds = clipFilter.sceneTagIds;
        }

        // Handle performer IDs filter
        if (clipFilter.performerIds && clipFilter.performerIds.length > 0) {
          params.performerIds = clipFilter.performerIds;
        }

        // Handle studio ID filter
        if (clipFilter.studioId) {
          params.studioId = clipFilter.studioId;
        }

        // Merge permanent filters
        if (permanentFilters.sceneId) {
          params.sceneId = permanentFilters.sceneId;
        }

        const result = await getClips(params);
        return result;
      });
    },
    [execute, permanentFilters]
  );

  const handleClipClick = (clip) => {
    navigate(`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`, {
      state: { fromPageTitle, shouldAutoplay: true },
    });
  };

  if (error) {
    return (
      <PageLayout>
        <PageHeader title={title} subtitle={subtitle} />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={title} subtitle={subtitle} />

      <SearchControls
        artifactType="clip"
        context={context}
        initialSort={initialSort}
        onQueryChange={handleQueryChange}
        onPerPageStateChange={setEffectivePerPage}
        permanentFilters={permanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
        totalPages={totalPages}
        totalCount={totalCount}
        syncToUrl={syncToUrl}
      >
        {({ gridDensity }) => (
          <ClipGrid
            clips={currentClips}
            density={gridDensity}
            loading={isLoading}
            onClipClick={handleClipClick}
            fromPageTitle={fromPageTitle}
            emptyMessage="No clips found"
            emptyDescription="Try adjusting your search filters"
          />
        )}
      </SearchControls>
    </PageLayout>
  );
};

export default ClipSearch;
