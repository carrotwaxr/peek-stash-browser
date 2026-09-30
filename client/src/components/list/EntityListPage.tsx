import { Fragment, useCallback, useMemo } from "react";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import { useFilterOptions, useListDefaults } from "../../hooks/useListOptions";
import { useListUrlState } from "../../hooks/useListUrlState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import { buildListQuery, sortOptionsFor } from "../../utils/listQuery";
import { ColumnConfigPopover, TableView } from "../table/index";
import {
  EmptyState,
  ErrorMessage,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import ListSkeleton from "./ListSkeleton";
import type { CardContext, ListPageConfig } from "./listPageConfigs";
import { pickPage, rowKey, useHideFromList } from "./listSources";

const NO_FILTERS: Record<string, unknown> = {};

type TableColumns = {
  id: string;
  label: string;
  sortable: boolean;
  width: string;
  mandatory: boolean;
}[];

/**
 * A library list page (Performers, Studios, Collections, Tags): its state in
 * the URL (`useListUrlState`), its page through the entity's list hook, and
 * the grid, table or the config's own views, with loading placeholders of the
 * card's shape and an empty state.
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
  });
  const { ready, filters, sort, page, perPage, q, viewMode, gridDensity } =
    listState;

  // A view with its own data (the tag tree) asks for no page and shows no pager
  const extraView =
    config.extraViews?.[viewMode as keyof typeof config.extraViews];
  const paged = extraView?.paged ?? true;

  const request = useMemo(
    () =>
      paged
        ? buildListQuery(
            entityType,
            { ready, filters, sort, page, perPage, q },
            NO_FILTERS,
            unitPreference
          )
        : null,
    [paged, entityType, ready, filters, sort, page, perPage, q, unitPreference]
  );

  const { data, error, isPending, isPlaceholderData } = source.useList(request);
  const { items, count } = pickPage(source, data);
  // The library is on its first sync: loading, not the error page
  const initializing = isLibraryInitializing(error);
  const isLoading = isPending || initializing;
  const totalPages = paged ? Math.ceil(count / perPage) : 0;

  // One hide handler and one context for every card, so memoised cards keep
  const onHideSuccess = useHideFromList(source, request);
  const cardContext = useMemo<CardContext>(
    () => ({ onHideSuccess, fromPageTitle: title }),
    [onHideSuccess, title]
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
        {items.map((item) => (
          <Fragment key={rowKey(item)}>
            {config.renderCard(item, cardContext)}
          </Fragment>
        ))}
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
          viewModes={config.viewModes}
          currentTableColumns={getColumnConfig()}
          tableColumnsPopover={columnsPopover}
        >
          {renderResults()}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

export default EntityListPage;
