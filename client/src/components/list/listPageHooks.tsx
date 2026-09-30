/**
 * The list pages' own hooks (`ListPageConfig.usePage`): what a page adds to
 * the shared list page, its wall's click and the Images lightbox.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedImage } from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { useConfig } from "../../contexts/ConfigContext";
import {
  type PageChangeOptions,
  usePaginatedLightbox,
} from "../../hooks/usePaginatedLightbox";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import Lightbox from "../ui/Lightbox";
import type {
  CardHandlers,
  ListPageData,
  ListPageExtras,
} from "./listPageConfigs";
import { LIST_SOURCES, type ListRow } from "./listSources";

/** Galleries: a wall tile opens its gallery (the cards link there themselves) */
export function useGalleryListPage(): ListPageExtras {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  const onItemClick = useCallback(
    (gallery: ListRow) => {
      void navigate(getEntityPath("gallery", gallery, hasMultipleInstances), {
        state: { fromPageTitle: "Galleries" },
      });
    },
    [navigate, hasMultipleInstances]
  );
  const cardHandlers = useMemo<CardHandlers>(
    () => ({ onItemClick }),
    [onItemClick]
  );
  return { cardHandlers };
}

/** An image's "id:instanceId" key: two servers can hold the same id */
const imageKey = (image: { id?: unknown; instanceId?: unknown }) =>
  makeCompositeKey(String(image.id), image.instanceId as string | undefined);

const sameImage = (
  a: { id?: unknown; instanceId?: unknown },
  b: { id?: unknown; instanceId?: unknown }
) => imageKey(a) === imageKey(b);

/** A path the server sent, or undefined for none or an empty one */
const sentPath = (path: string | undefined): string | undefined =>
  path === undefined || path === "" ? undefined : path;

type ImagesResponse = {
  findImages?: { images?: ListRow[] } & Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Images: a card or wall tile opens the lightbox (a history entry naming
 * the image, so Back closes it), which pages across the list by the list's
 * own page and page size (a page turned from the lightbox replaces the
 * entry); a card's O, rating and favorite change the image on its instance
 * in the cached page.
 */
export function useImageListPage({
  listState,
  items,
  count,
  request,
  error,
}: ListPageData): ListPageExtras {
  const queryClient = useQueryClient();
  const { page, perPage, setPage } = listState;

  const turnPage = useCallback(
    (next: number, options?: PageChangeOptions) =>
      setPage(next, { history: options?.replace ? "replace" : "push" }),
    [setPage]
  );
  // The open image is in the URL (`image`, which the list's setters keep)
  const lightbox = usePaginatedLightbox({
    perPage,
    totalCount: count,
    externalPage: page,
    onExternalPageChange: turnPage,
    images: items,
  });
  const { openLightbox, consumePendingLightboxIndex, failPendingPage } =
    lightbox;

  // A page turned from the lightbox opens at its first or last image once
  // the page's images arrive; if the page fails, the lightbox goes back to
  // the image it left (a first sync's 503 is loading, not a failure)
  useEffect(() => {
    if (!error) consumePendingLightboxIndex();
  }, [items, error, consumePendingLightboxIndex]);
  useEffect(() => {
    if (error && !isLibraryInitializing(error)) failPendingPage(error);
  }, [error, failPendingPage]);

  const onItemClick = useCallback(
    (image: ListRow) => {
      const index = items.findIndex((row) => sameImage(row, image));
      openLightbox(index >= 0 ? index : 0);
    },
    [items, openLightbox]
  );

  // The cached page with the rows `update` returns. The image is (id,
  // instance): two servers can hold the same id.
  const updateCachedPage = useCallback(
    (update: (rows: ListRow[]) => ListRow[]) => {
      if (!request) return;
      queryClient.setQueryData<ImagesResponse>(
        LIST_SOURCES.image.listKey(request),
        (old) => {
          const found = old?.findImages;
          if (!old || !found?.images) return old;
          return {
            ...old,
            findImages: { ...found, images: update(found.images) },
          };
        }
      );
    },
    [queryClient, request]
  );

  const updateImageInCache = useCallback(
    (imageId: string, instanceId: string, updates: Record<string, unknown>) => {
      const target = makeCompositeKey(imageId, instanceId);
      updateCachedPage((rows) =>
        rows.map((row) =>
          imageKey(row) === target ? { ...row, ...updates } : row
        )
      );
    },
    [updateCachedPage]
  );

  const onOCounterChange = useCallback(
    (imageId: string, newCount: number, instanceId: string) =>
      updateImageInCache(imageId, instanceId, { oCounter: newCount }),
    [updateImageInCache]
  );
  const onRatingChange = useCallback(
    (imageId: string, newRating: number | null, instanceId: string) =>
      updateImageInCache(imageId, instanceId, { rating100: newRating }),
    [updateImageInCache]
  );
  const onFavoriteChange = useCallback(
    (imageId: string, newFavorite: boolean, instanceId: string) =>
      updateImageInCache(imageId, instanceId, { favorite: newFavorite }),
    [updateImageInCache]
  );

  const cardHandlers = useMemo<CardHandlers>(
    () => ({ onItemClick, onOCounterChange, onRatingChange, onFavoriteChange }),
    [onItemClick, onOCounterChange, onRatingChange, onFavoriteChange]
  );

  const lightboxImages = useMemo(
    () =>
      items.map((img) => {
        const paths = img.paths as Record<string, string> | undefined;
        // The server serves an image only from the instance it names
        const instanceQuery =
          typeof img.instanceId === "string" && img.instanceId !== ""
            ? `?instanceId=${encodeURIComponent(img.instanceId)}`
            : "";
        const proxied = (kind: string) =>
          `/api/proxy/image/${img.id as string}/${kind}${instanceQuery}`;
        return {
          ...img,
          paths: {
            image: sentPath(paths?.image) ?? proxied("image"),
            preview: sentPath(paths?.preview) ?? sentPath(paths?.thumbnail),
            thumbnail: sentPath(paths?.thumbnail) ?? proxied("thumbnail"),
          },
          oCounter: (img.oCounter as number | undefined) ?? 0,
        };
      }) as unknown as NormalizedImage[],
    [items]
  );

  // The lightbox's own changes, back into the cached page
  const onImagesUpdate = useCallback(
    (updated: NormalizedImage[]) =>
      updateCachedPage((rows) =>
        rows.map((row) => {
          const match = updated.find((u) => imageKey(u) === imageKey(row));
          return match ? { ...row, ...match } : row;
        })
      ),
    [updateCachedPage]
  );

  const after =
    items.length > 0 ? (
      <Lightbox
        isOpen={lightbox.lightboxOpen}
        images={lightboxImages}
        initialIndex={lightbox.lightboxIndex}
        onClose={lightbox.closeLightbox}
        onImagesUpdate={onImagesUpdate}
        // Cross-page navigation, by the list's page and page size
        onPageBoundary={lightbox.onPageBoundary}
        totalCount={count}
        pageOffset={(page - 1) * perPage}
        onIndexChange={lightbox.onIndexChange}
        isPageTransitioning={lightbox.isPageTransitioning}
        transitionKey={lightbox.transitionKey}
      />
    ) : null;

  return { cardHandlers, after };
}
