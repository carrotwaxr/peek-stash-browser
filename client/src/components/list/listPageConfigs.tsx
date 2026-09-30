/**
 * One config per list page on `EntityListPage`: what it lists, how its cards
 * and loading placeholders look, and the views beyond grid and table.
 */
import type { ReactNode } from "react";
import type {
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
} from "@peek/shared-types";
import type { ListUrlState } from "../../hooks/useListUrlState";
import { GroupCard, PerformerCard, StudioCard, TagCard } from "../cards/index";
import type { SkeletonAspect } from "./ListSkeleton";
import TagHierarchyPanel from "./TagHierarchyPanel";
import {
  type CardHideHandler,
  LIST_SOURCES,
  type ListRow,
  type ListSource,
  type ListSourceEntity,
} from "./listSources";
import { type ViewModeId, viewModeOptions } from "./listViewModes";

/** What every card on a page gets: stable across renders, so memoised cards stay put */
export interface CardContext {
  onHideSuccess: CardHideHandler;
  fromPageTitle: string;
}

export interface ViewContext {
  listState: ListUrlState;
}

/** A view beyond grid and table (the Tags hierarchy) */
export interface ExtraView {
  render: (ctx: ViewContext) => ReactNode;
  /**
   * The view shows the list's page, so the page is fetched and paged; a view
   * with its own data (the hierarchy's whole tree) sets false
   */
  paged: boolean;
}

export interface ListPageConfig {
  entityType: ListSourceEntity;
  /** The page's heading and document title */
  title: string;
  subtitle: string;
  /** The entity's default sort */
  defaultSort: string;
  /** The views the page renders (`LIST_VIEW_MODES`) */
  viewModes: { id: ViewModeId; label: string }[];
  /** Its list hook, query key and response shape */
  source: ListSource;
  /** One row's card; key it by nothing, the page keys it by id and instance */
  renderCard: (item: ListRow, ctx: CardContext) => ReactNode;
  /** The loading placeholder: the card image's shape and its text rows' height */
  skeleton: { aspect: SkeletonAspect; heightRem: number };
  /** The table's columns entity, when not the entity type */
  tableEntity?: string;
  extraViews?: Partial<Record<ViewModeId, ExtraView>>;
  /** "No performers found" */
  emptyMessage: string;
}

export const PERFORMER_LIST: ListPageConfig = {
  entityType: "performer",
  title: "Performers",
  subtitle: "Browse performers in your library",
  defaultSort: "o_counter",
  viewModes: viewModeOptions("performer"),
  source: LIST_SOURCES.performer,
  renderCard: (item, { onHideSuccess, fromPageTitle }) => (
    <PerformerCard
      performer={item as unknown as NormalizedPerformer}
      fromPageTitle={fromPageTitle}
      onHideSuccess={onHideSuccess}
    />
  ),
  skeleton: { aspect: "portrait", heightRem: 5 },
  emptyMessage: "No performers found",
};

export const STUDIO_LIST: ListPageConfig = {
  entityType: "studio",
  title: "Studios",
  subtitle: "Browse studios and production companies in your library",
  defaultSort: "scenes_count",
  viewModes: viewModeOptions("studio"),
  source: LIST_SOURCES.studio,
  renderCard: (item, { onHideSuccess, fromPageTitle }) => (
    <StudioCard
      studio={item as unknown as NormalizedStudio}
      fromPageTitle={fromPageTitle}
      onHideSuccess={onHideSuccess}
    />
  ),
  skeleton: { aspect: "landscape", heightRem: 6 },
  emptyMessage: "No studios found",
};

export const GROUP_LIST: ListPageConfig = {
  entityType: "group",
  title: "Collections",
  subtitle: "Browse collections and movies in your library",
  defaultSort: "name",
  viewModes: viewModeOptions("group"),
  source: LIST_SOURCES.group,
  renderCard: (item, { onHideSuccess, fromPageTitle }) => (
    <GroupCard
      group={
        item as unknown as NormalizedGroup & { description?: string | null }
      }
      fromPageTitle={fromPageTitle}
      onHideSuccess={onHideSuccess}
    />
  ),
  skeleton: { aspect: "portrait", heightRem: 6 },
  emptyMessage: "No collections found",
};

export const TAG_LIST: ListPageConfig = {
  entityType: "tag",
  title: "Tags",
  subtitle: "Browse tags in your library",
  defaultSort: "scenes_count",
  viewModes: viewModeOptions("tag"),
  source: LIST_SOURCES.tag,
  renderCard: (item, { onHideSuccess, fromPageTitle }) => (
    <TagCard
      tag={item as unknown as NormalizedTag & { child_count?: number }}
      fromPageTitle={fromPageTitle}
      onHideSuccess={onHideSuccess}
    />
  ),
  skeleton: { aspect: "landscape", heightRem: 6 },
  extraViews: {
    hierarchy: {
      render: ({ listState }) => <TagHierarchyPanel listState={listState} />,
      paged: false,
    },
  },
  emptyMessage: "No tags found",
};
