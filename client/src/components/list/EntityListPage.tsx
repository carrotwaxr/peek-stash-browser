import { Fragment, useCallback, useMemo } from "react";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import { useFolderViewTags } from "../../hooks/useFolderViewTags";
import {
  useFilterOptions,
  useListDefaults,
  useLockedFields,
} from "../../hooks/useListOptions";
import { useListUrlState } from "../../hooks/useListUrlState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import {
  WALL_VIEW_SETTINGS,
  useWallPlayback,
} from "../../hooks/useWallPlayback";
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
const NO_FILTERS: Record<string, unknown> = {};
const NO_SETTINGS: typeof WALL_VIEW_SETTINGS = [];

type WallZoom = React.ComponentProps<typeof WallView>["zoomLevel"];
type WallEntity = React.ComponentProps<typeof WallView>["entityType"];

/**
 * A list inside another page (the scene list on Scenes and on a detail
 * page's Scenes tab): its heading, the page's own fixed filters and the
 * preset context. The page sets the document title.
 */
export interface ListEmbed {
  /** The preset context ("scene_performer"); the entity type by default */
  context?: string;
  /** The entity's default sort, over the config's */
  defaultSort?: string;
  /**
   * The page's own filters (a performer's Scenes tab has its performer):
   * never in the URL, not offered in the panel, merged last into the request
   */
  permanentFilters?: Record<string, unknown>;
  /** Names for the fixed filters' chips */
  permanentFiltersMetadata?: Record<string, unknown>;
  /** The heading over the list; none unless named */
  title?: string;
  subtitle?: string;
  /** Where a card's page says the user came from */
  fromPageTitle?: string;
  /** The folder view is offered (true unless set false) */
  folderView?: boolean;
}

/** The detail page a timeline or folder view sits on: its counts and folders are that page's */
interface PageScope {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

const SCOPE_FIELDS = [
  ["performers", "performerId"],
  ["tags", "tagId"],
  ["studios", "studioId"],
  ["groups", "groupId"],
] as const;

/** The page's entity from its fixed filters (a performer's Scenes tab: its performer) */
function scopeOf(permanentFilters: Record<string, unknown>): PageScope | null {
  const scope: PageScope = {};
  for (const [field, param] of SCOPE_FIELDS) {
    const criterion = permanentFilters[field] as
      | { value?: unknown[] }
      | undefined;
    const first = criterion?.value?.[0];
    if (typeof first === "string" && first !== "") scope[param] = first;
  }
  return Object.keys(scope).length > 0 ? scope : null;
}

/** Filters equal by content are one object, whatever object the page passed */
function useFiltersByContent(
  filters: Record<string, unknown> | undefined
): Record<string, unknown> {
  const key = filters ? JSON.stringify(filters) : "";
  return useMemo(
    () =>
      key === "" ? NO_FILTERS : (JSON.parse(key) as Record<string, unknown>),
    [key]
  );
}

/** Sets the document title (a list page does; a list inside a page leaves it to the page) */
const DocumentTitle = ({ title }: { title: string }) => {
  usePageTitle(title);
  return null;
};

type TableColumns = {
  id: string;
  label: string;
  sortable: boolean;
  width: string;
  mandatory: boolean;
}[];

/**
 * A library list (Scenes, Performers, Studios, Collections, Tags, Galleries,
 * Images, Clips, and the scene list on a detail page's tab): its state in
 * the URL (`useListUrlState`), its page through the entity's list hook, and
 * the grid, table, wall, timeline, folder or the config's own views, with
 * loading placeholders of the card's shape and an empty state. The
 * timeline's period and the open folder live in the URL too, and filter the
 * list only in their view.
 */
const EntityListPage = ({
  config,
  embed,
}: {
  config: ListPageConfig;
  /** Set for a list inside another page; left out, the list is the page */
  embed?: ListEmbed;
}) => {
  const { entityType, source } = config;
  const title = embed ? (embed.title ?? "") : config.title;
  const subtitle = embed ? embed.subtitle : config.subtitle;
  const fromPageTitle = embed ? embed.fromPageTitle : config.title;
  const context = embed?.context;
  const pagePermanentFilters = useFiltersByContent(embed?.permanentFilters);
  const lockedFields = useLockedFields(entityType, pagePermanentFilters);
  const scope = useMemo(
    () => scopeOf(pagePermanentFilters),
    [pagePermanentFilters]
  );
  const { unitPreference } = useUnitPreference();
  const filterOptions = useFilterOptions(entityType);
  const defaults = useListDefaults(
    entityType,
    embed?.defaultSort ?? config.defaultSort
  );
  const withoutFolder = embed?.folderView === false;
  const viewModes = useMemo(
    () =>
      withoutFolder
        ? config.viewModes.filter((mode) => mode.id !== "folder")
        : config.viewModes,
    [config.viewModes, withoutFolder]
  );
  const viewModeIds = useMemo(
    () => viewModes.map((mode) => mode.id),
    [viewModes]
  );
  const sortOptions = useCallback(
    (filters: Record<string, unknown>) => sortOptionsFor(entityType, filters),
    [entityType]
  );

  const listState = useListUrlState({
    entityType,
    ...(context ? { context } : {}),
    filterOptions,
    sortOptions,
    viewModes: viewModeIds,
    defaults,
    permanentFilters: pagePermanentFilters,
    lockedFields,
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
  const {
    tags: folderTags,
    isLoading: tagsLoading,
    error: folderTagsError,
    refetch: refetchFolderTags,
  } = useFolderViewTags(viewMode === "folder", scope);
  // A failed tree shows its error; the library's first sync is loading
  const folderTagsInitializing = isLibraryInitializing(folderTagsError);
  const folderTagsFailed = !!folderTagsError && !folderTagsInitializing;

  // A view with its own data (the tag tree) asks for no page and shows no pager
  const extraView =
    config.extraViews?.[viewMode as keyof typeof config.extraViews];
  const paged = extraView?.paged ?? true;
  // The timeline lists a period's items: nothing is asked for until one is
  // chosen (the latest, once the timeline loads)
  const awaitingPeriod =
    viewMode === "timeline" && periodDateRange(timelinePeriod) === null;
  // The folder view's root lists folders only: no page is asked for
  const folderRoot = viewMode === "folder" && folderPath.length === 0;
  const listed = paged && !folderRoot;

  const request = useMemo(() => {
    const query =
      listed && !awaitingPeriod
        ? buildListQuery(
            entityType,
            { ready, filters, sort, page, perPage, q },
            permanentFilters,
            unitPreference
          )
        : null;
    // The list hook's own request shape (the clips' flat options)
    return query && source.toRequest
      ? source.toRequest(query, permanentFilters)
      : query;
  }, [
    listed,
    awaitingPeriod,
    source,
    entityType,
    ready,
    filters,
    sort,
    page,
    perPage,
    q,
    permanentFilters,
    unitPreference,
  ]);

  const { data, error, isPending, isPlaceholderData } = source.useList(request);
  const { items, count } = pickPage(source, data);
  // The library is on its first sync: loading, not the error page
  const initializing = isLibraryInitializing(error);
  // An empty placeholder (the previous query's) is no answer to this one:
  // loading, not "No scenes found" until the new query settles. A placeholder
  // with rows stays on screen, dimmed
  const isLoading =
    isPending || initializing || (isPlaceholderData && items.length === 0);
  const totalPages = listed ? Math.ceil(count / perPage) : 0;

  // The page's own handlers and parts (the Images lightbox, a scene's queue)
  const usePage = config.usePage ?? useNoExtras;
  const { cardHandlers, after } = usePage({
    listState,
    items,
    count,
    request,
    error,
    title,
    fromPageTitle,
  });

  // One hide handler and one context for every card, so memoised cards keep
  const onHideSuccess = useHideFromList(source, request);
  const cardContext = useMemo<CardContext>(
    () => ({ ...cardHandlers, onHideSuccess, fromPageTitle }),
    [cardHandlers, onHideSuccess, fromPageTitle]
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

  const documentTitle = embed ? null : <DocumentTitle title={title} />;

  if (error && !initializing && paged) {
    return (
      <PageLayout>
        {documentTitle}
        <PageHeader title={title} subtitle={subtitle} />
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
          {...(config.tableSorts === false
            ? {}
            : { onSort: listState.setSort })}
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
          entityType={entityType as WallEntity}
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
          filters={scope}
        />
      );
    }

    if (viewMode === "folder") {
      if (folderTagsFailed) {
        return (
          <ErrorMessage
            error={folderTagsError}
            onRetry={() => void refetchFolderTags()}
          />
        );
      }
      if (!config.folder) return null;
      return (
        <FolderView
          items={isLoading || folderRoot ? [] : items}
          itemCount={count}
          tags={folderTags}
          countField={config.folder.countField}
          entityLabel={config.folder.label}
          path={folderPath}
          onPathChange={listState.setFolderPath}
          gridDensity={gridDensity}
          loading={tagsLoading || folderTagsInitializing}
          itemsLoading={!folderRoot && isLoading}
          renderItem={renderKeyedCard}
        />
      );
    }

    if (config.renderGrid) {
      return config.renderGrid({
        items,
        loading: isLoading,
        gridDensity,
        ctx: cardContext,
        emptyMessage: config.emptyMessage,
      });
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
      {documentTitle}
      <div>
        <PageHeader title={title} subtitle={subtitle} />

        <LibraryInitializingBanner />

        <SearchControls
          artifactType={entityType}
          {...(context ? { context } : {})}
          listState={listState}
          isRefreshing={isPlaceholderData}
          totalPages={totalPages}
          totalCount={listed ? count : 0}
          permanentFilters={permanentFilters}
          permanentFiltersMetadata={embed?.permanentFiltersMetadata}
          viewModes={viewModes}
          contextSettings={
            config.wallPlaybackSetting && viewMode === "wall"
              ? WALL_VIEW_SETTINGS
              : NO_SETTINGS
          }
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
