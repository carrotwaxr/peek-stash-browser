/**
 * One config per list page on `EntityListPage`: what it lists, how its cards
 * and loading placeholders look, and the views beyond grid and table.
 */
import type { ReactNode } from "react";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
} from "@peek/shared-types";
import type { ListUrlState } from "../../hooks/useListUrlState";
import {
  GalleryCard,
  GroupCard,
  ImageCard,
  PerformerCard,
  StudioCard,
  TagCard,
} from "../cards/index";
import type { SkeletonAspect } from "./ListSkeleton";
import TagHierarchyPanel from "./TagHierarchyPanel";
import { useGalleryListPage, useImageListPage } from "./listPageHooks";
import {
  type CardHideHandler,
  LIST_SOURCES,
  type ListRequest,
  type ListRow,
  type ListSource,
  type ListSourceEntity,
} from "./listSources";
import { type ViewModeId, viewModeOptions } from "./listViewModes";

/** A card's change to its entity: the id, the new value and the instance */
export type CardChangeHandler<T> = (
  entityId: string,
  value: T,
  instanceId: string
) => void;

/** The handlers a page's own hook gives its cards and wall (`ListPageConfig.usePage`) */
export interface CardHandlers {
  /**
   * A card's or wall tile's click with its item (the Images lightbox); a
   * page whose cards open their own page leaves it out
   */
  onItemClick?: (item: ListRow) => void;
  onOCounterChange?: CardChangeHandler<number>;
  onRatingChange?: CardChangeHandler<number>;
  onFavoriteChange?: CardChangeHandler<boolean>;
}

/** What every card on a page gets: stable across renders, so memoised cards stay put */
export interface CardContext extends CardHandlers {
  onHideSuccess: CardHideHandler;
  fromPageTitle: string;
}

/** The list a page's own hook reads */
export interface ListPageData {
  listState: ListUrlState;
  /** The page's rows as shown */
  items: ListRow[];
  /** The list's total */
  count: number;
  /** The page's request (null while none is sent); its cache key's params */
  request: ListRequest;
}

/** What a page's own hook adds to the list page */
export interface ListPageExtras {
  /** Stable across renders while their inputs are */
  cardHandlers?: CardHandlers;
  /** Rendered below the list (the Images lightbox) */
  after?: ReactNode;
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
  /**
   * The page's own state and handlers beyond the list (the Images
   * lightbox), called on every render of the page
   */
  usePage?: (data: ListPageData) => ListPageExtras;
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

export const GALLERY_LIST: ListPageConfig = {
  entityType: "gallery",
  title: "Galleries",
  subtitle: "Browse image galleries in your library",
  defaultSort: "created_at",
  viewModes: viewModeOptions("gallery"),
  source: LIST_SOURCES.gallery,
  renderCard: (item, { onHideSuccess, fromPageTitle }) => (
    <GalleryCard
      gallery={item as unknown as NormalizedGallery}
      fromPageTitle={fromPageTitle}
      onHideSuccess={onHideSuccess}
    />
  ),
  skeleton: { aspect: "portrait", heightRem: 5 },
  emptyMessage: "No galleries found",
  usePage: useGalleryListPage,
};

export const IMAGE_LIST: ListPageConfig = {
  entityType: "image",
  title: "Images",
  subtitle: "Browse all images in your library",
  defaultSort: "created_at",
  viewModes: viewModeOptions("image"),
  source: LIST_SOURCES.image,
  renderCard: (item, ctx) => (
    <ImageCard
      image={item as unknown as NormalizedImage}
      // One click handler for every card: the card passes its image back
      onClick={
        ctx.onItemClick as unknown as
          | ((image: NormalizedImage) => void)
          | undefined
      }
      fromPageTitle={ctx.fromPageTitle}
      onHideSuccess={ctx.onHideSuccess}
      onOCounterChange={ctx.onOCounterChange}
      onRatingChange={ctx.onRatingChange}
      onFavoriteChange={ctx.onFavoriteChange}
    />
  ),
  skeleton: { aspect: "landscape", heightRem: 4 },
  emptyMessage: "No images found",
  usePage: useImageListPage,
};
