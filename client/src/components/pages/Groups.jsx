import { forwardRef, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";

import { libraryApi } from "../../services/api.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  GridCard,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

const Groups = () => {
  usePageTitle("Collections");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = useGridColumns("groups");

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  // Note: We don't fetch initial data here anymore.
  // SearchControls will trigger the initial query via onQueryChange based on URL params.

  const handleQueryChange = async (newQuery, retryCount = 0) => {
    // Don't make API calls if not authenticated or still checking auth
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    // Avoid duplicate queries
    if (lastQuery && deepEqual(newQuery, lastQuery)) {
      return;
    }

    try {
      setIsLoading(true);
      setLastQuery(newQuery);
      setError(null);
      setInitMessage(null);
      const result = await getGroups(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is syncing library, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000);
        return;
      }
      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentGroups = data?.groups || [];
  const totalCount = data?.count || 0;

  // Calculate totalPages based on URL params
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    _tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentGroups,
    columns,
    totalPages,
    onItemSelect: (group) => navigate(`/collection/${group.id}`),
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentGroups.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Collections" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Collections"
          subtitle="Browse collections and movies in your library"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="group"
          initialSort="name"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
          {...searchControlsProps}
        >
          {isLoading ? (
            <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    height: "8rem",
                  }}
                />
              ))}
            </div>
          ) : (
            <>
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentGroups.map((group, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <GroupCard
                      key={group.id}
                      group={group}
                      isTVMode={isTVMode}
                      referrerUrl={`${location.pathname}${location.search}`}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            </>
          )}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const GroupCard = forwardRef(
  ({ group, tabIndex, isTVMode = false, referrerUrl, ...others }, ref) => {
    const imagePath = group.front_image_path || group.back_image_path;
    const subtitle = (() => {
      if (group.studio && group.date) {
        return `${group.studio.name} • ${group.date}`;
      } else if (group.studio) {
        return group.studio.name;
      } else if (group.date) {
        return group.date;
      }
      return null;
    })();

    return (
      <GridCard
        description={group.description}
        entityType="group"
        imagePath={imagePath}
        indicators={[
          { type: "SCENES", count: group.scene_count },
          { type: "GROUPS", count: group.sub_group_count },
        ]}
        linkTo={`/collection/${group.id}`}
        maxTitleLines={2}
        ratingControlsProps={{
          entityId: group.id,
          initialRating: group.rating,
          initialFavorite: group.favorite || false,
          initialOCounter: group.o_counter,
        }}
        ref={ref}
        referrerUrl={referrerUrl}
        subtitle={subtitle}
        tabIndex={isTVMode ? tabIndex : -1}
        title={group.name}
        {...others}
      />
    );
  }
);

GroupCard.displayName = "GroupCard";

const getGroups = async (query) => {
  const response = await libraryApi.findGroups(query);

  // Extract groups and count from server response structure
  const findGroups = response?.findGroups;
  const result = {
    groups: findGroups?.groups || [],
    count: findGroups?.count || 0,
  };
  return result;
};

export default Groups;
