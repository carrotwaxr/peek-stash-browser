import { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { libraryApi } from "../../services/api.js";
import { GroupCard } from "../cards/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

const Groups = () => {
  usePageTitle("Collections");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const columns = useGridColumns("groups");

  const { data, isLoading, error, initMessage, execute } = useCancellableQuery();

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getGroups(newQuery, signal));
    },
    [execute]
  );

  const currentGroups = data?.groups || [];
  const totalCount = data?.count || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

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
    onItemSelect: (group) =>
      navigate(`/collection/${group.id}`, {
        state: { fromPageTitle: "Collections" },
      }),
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
          onPerPageStateChange={setEffectivePerPage}
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
                      fromPageTitle="Collections"
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
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

const getGroups = async (query, signal) => {
  const response = await libraryApi.findGroups(query, signal);

  // Extract groups and count from server response structure
  const findGroups = response?.findGroups;
  const result = {
    groups: findGroups?.groups || [],
    count: findGroups?.count || 0,
  };
  return result;
};

export default Groups;
