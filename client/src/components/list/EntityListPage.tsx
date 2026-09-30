import { Fragment, useCallback, useMemo } from "react";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import { useFolderViewTags } from "../../hooks/useFolderViewTags";
import { useFilterOptions, useListDefaults } from "../../hooks/useListOptions";
import { useListUrlState } from "../../hooks/useListUrlState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import { useWallPlayback } from "../../hooks/useWallPlayback";
import { buildListQuery, sortOptionsFor } from "../../utils/listQuery";
import { FolderView } from "../folder/index";
import { ColumnConfigPopover, TableView } from "../table/index";
import TimelineView from "../timeline/TimelineView";
import { periodDateRange } from "../timeline/useTimelineState";
import {
  EmptyState,
  ErrorMessage,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import WallView from "../wall/WallView";
import ListSkeleton from "./ListSkeleton";
import type {
  CardContext,
  ListPageConfig,
  ListPageExtras,
} from "./listPageConfigs";
import { type ListRow, pickPage, rowKey, useHideFromList } from "./listSources";
import { timelineAndFolderFilters } from "./viewFilters";

const NO_EXTRAS: ListPageExtras = {};
const useNoExtras = (): ListPageExtras => NO_EXTRAS;

type WallZoom = React.ComponentProps<typeof WallView>["zoomLevel"];

type TableColumns = {
  id: string;
  label: string;
  sortable: boolean;
  width: string;
  mandatory: boolean;
}[];

/**
 * A library list page (Performers, Studios, Collections, Tags, Galleries,
 * Images): its state in the URL (`useListUrlState`), its page through the
 * entity's list hook, and the grid, table, wall, timeline, folder or the
 * config's own views, with loading placeholders of the card's shape and an
 * empty state. The timeline's period and the open folder live in the URL
 * too, and filter the list only in their view.
 */
const EntityListPage = ({ config }: { config: ListPageConfig }) => {
  const { entityType, source, title } = config;
  usePageTitle(title);
  const { unitPreference } = useUnitPreference();
  const filterOptions = useFilterOptions(entityType);
  const defaults = useListDefaults(entityType, config.defaultSort);
  const viewModeIds = useMemo(
    () => config.viewModes.map((mode) => mode.id),
    [config.viewModes]
  );
  const sortOptions = useCallback(
    (filters: Record<string, unknown>) => sortOptionsFor(entityType, filters),
    [entityType]
  );

  const listState = useListUrlState({
    entityType,
    filterOptions,
    sortOptions,
    viewModes: viewModeIds,
    defaults,
    viewFilters: timelineAndFolderFilters,
  });
  const {
    ready,
    filters,
    sort,
    page,
    perPage,
    q,
    viewMode,
    zoomLevel,
    gridDensity,
    timelinePeriod,
    folderPath,
    permanentFilters,
  } = listState;
  const { wallPlayback } = useWallPlayback();
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    viewMode === "folder"
  );

  // A view with its own data (the tag tree) asks for no page and shows no pager
  const extraView =
    config.extraViews?.[viewMode as keyof typeof config.extraViews];
  const paged = extraView?.paged ?? true;
  // The timeline lists a period's items: nothing is asked for until one is
  // chosen (the latest, once the timeline loads)
  const awaitingPeriod =
    viewMode === "timeline" && periodDateRange(timelinePeriod) === null;

  const request = useMemo(
    () =>
      paged && !awaitingPeriod
        ? buildListQuery(
            entityType,
            { ready, filters, sort, page, perPage, q },
            permanentFilters,
            unitPreference
          )
        : null,
    [
      paged,
      awaitingPeriod,
      entityType,
      ready,
      filters,
      sort,
      page,
      perPage,
      q,
      permanentFilters,
      unitPreference,
    ]
  );

  const { data, error, isPending, isPlaceholderData } = source.useList(request);
  const { items, count } = pickPage(source, data);
  // The library is on its first sync: loading, not the error page
  const initializing = isLibraryInitializing(error);
  const isLoading = isPending || initializing;
  const totalPages = paged ? Math.ceil(count / perPage) : 0;

  // The page's own handlers and parts (the Images lightbox)
  const usePage = config.usePage ?? useNoExtras;
  const { cardHandlers, after } = usePage({ listState, items, count, request });

  // One hide handler and one context for every card, so memoised cards keep
  const onHideSuccess = useHideFromList(source, request);
  const cardContext = useMemo<CardContext>(
    () => ({ ...cardHandlers, onHideSuccess, fromPageTitle: title }),
    [cardHandlers, onHideSuccess, title]
  );
  const { renderCard } = config;
  const renderKeyedCard = useCallback(
    (item: ListRow) => (
      <Fragment key={rowKey(item)}>{renderCard(item, cardContext)}</Fragment>
    ),
    [renderCard, cardContext]
  );

  const {
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
  } = useTableColumns(config.tableEntity ?? entityType);

  if (error && !initializing && paged) {
    return (
      <PageLayout>
        <PageHeader title={title} />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  const columnsPopover = (
    <ColumnConfigPopover
      allColumns={allColumns}
      visibleColumnIds={visibleColumnIds}
      columnOrder={columnOrder}
      onToggleColumn={toggleColumn}
      onMoveColumn={moveColumn}
    />
  );

  const renderResults = () => {
    if (extraView) return extraView.render({ listState });

    if (viewMode === "table") {
      return (
        <TableView
          items={isLoading ? [] : items}
          columns={visibleColumns as TableColumns}
          sort={{ field: sort.field, direction: sort.direction }}
          onSort={listState.setSort}
          onHideColumn={hideColumn}
          entityType={config.tableEntity ?? entityType}
          isLoading={isLoading}
          columnsPopover={columnsPopover}
        />
      );
    }

    if (viewMode === "wall") {
      return (
        <WallView
          items={isLoading ? [] : items}
          entityType={entityType as "gallery" | "image"}
          zoomLevel={zoomLevel as WallZoom}
          playbackMode={wallPlayback}
          onItemClick={cardContext.onItemClick}
          loading={isLoading}
          emptyMessage={config.emptyMessage}
        />
      );
    }

    if (viewMode === "timeline") {
      return (
        <TimelineView
          entityType={entityType}
          items={items}
          renderItem={renderKeyedCard}
          period={timelinePeriod}
          onPeriodChange={listState.setTimelinePeriod}
          loading={!awaitingPeriod && isLoading}
          emptyMessage={`${config.emptyMessage} for this time period`}
          gridDensity={gridDensity}
        />
      );
    }

    if (viewMode === "folder") {
      return (
        <FolderView
          items={isLoading ? [] : items}
          tags={folderTags}
          path={folderPath}
          onPathChange={listState.setFolderPath}
          gridDensity={gridDensity}
          loading={isLoading || tagsLoading}
          emptyMessage={config.emptyMessage}
          renderItem={renderKeyedCard}
        />
      );
    }

    if (isLoading) {
      return (
        <ListSkeleton
          perPage={perPage}
          aspect={config.skeleton.aspect}
          heightRem={config.skeleton.heightRem}
          gridDensity={gridDensity}
        />
      );
    }

    if (items.length === 0) {
      return (
        <EmptyState
          title={config.emptyMessage}
          description="Try adjusting your search filters"
        />
      );
    }

    return (
      <div className={getGridClasses("standard", gridDensity)}>
        {items.map(renderKeyedCard)}
      </div>
    );
  };

  return (
    <PageLayout>
      <div>
        <PageHeader title={title} subtitle={config.subtitle} />

        <LibraryInitializingBanner />

        <SearchControls
          artifactType={entityType}
          listState={listState}
          isRefreshing={isPlaceholderData}
          totalPages={totalPages}
          totalCount={paged ? count : 0}
          permanentFilters={permanentFilters}
          viewModes={config.viewModes}
          currentTableColumns={getColumnConfig()}
          tableColumnsPopover={columnsPopover}
        >
          {renderResults()}
        </SearchControls>

        {after}
      </div>
    </PageLayout>
  );
};

export default EntityListPage;
