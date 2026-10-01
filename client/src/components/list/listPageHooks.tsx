/**
 * The list pages' own hooks (`ListPageConfig.usePage`): what a page adds to
 * the shared list page, its wall's click and the Images lightbox.
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import type { ImageListItem } from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { libraryApi } from "../../api/library";
import { useConfig } from "../../contexts/ConfigContext";
import {
  type PageChangeOptions,
  usePaginatedLightbox,
} from "../../hooks/usePaginatedLightbox";
import { makeCompositeKey, parseCompositeKey } from "../../utils/compositeKey";
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
const sentPath = (path: string | null | undefined): string | undefined =>
  path == null || path === "" ? undefined : path;

/** The viewer's image: its source and preview fall back to the image's
 * proxy route when the server sent none */
const viewerImage = (img: ImageListItem): ImageListItem => {
  // The server serves an image only from the instance it names
  const instanceQuery = img.instanceId
    ? `?instanceId=${encodeURIComponent(img.instanceId)}`
    : "";
  const proxied = (kind: string) =>
    `/api/proxy/image/${img.id}/${kind}${instanceQuery}`;
  return {
    ...img,
    paths: {
      image: sentPath(img.paths.image) ?? proxied("image"),
      preview:
        sentPath(img.paths.preview) ?? sentPath(img.paths.thumbnail) ?? null,
      thumbnail: sentPath(img.paths.thumbnail) ?? proxied("thumbnail"),
    },
  };
};

/**
 * One image by its "id:instanceId", read through the Images list on its own
 * instance, so the viewer's exclusions apply and the rating, favorite and O
 * count are the viewer's; null for an image they cannot see
 */
const readImage = async (
  key: string,
  signal: AbortSignal
): Promise<ImageListItem | null> => {
  const { id, instanceId } = parseCompositeKey(key);
  try {
    const { findImages } = await libraryApi.findImages(
      {
        ids: [String(id)],
        ...(instanceId ? { image_filter: { instance_id: instanceId } } : {}),
      },
      signal
    );
    return findImages.images.find((image) => imageKey(image) === key) ?? null;
  } catch (error) {
    // The server refuses an id that is not one (a mangled link): no image
    if (error instanceof ApiError && error.status === 400) return null;
    throw error;
  }
};

type ImagesResponse = {
  findImages?: { images?: ListRow[] } & Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Images: a card or wall tile opens the lightbox (a history entry naming
 * the image, so Back closes it), which pages across the list by the list's
 * own page and page size (a page turned from the lightbox replaces the
 * entry); a card's O, rating and favorite change the image on its instance
 * in the cached page. An `image` param naming an image not on the loaded
 * page (a link to it) reads that image by id and shows it alone; a detail
 * page's tab reads it the same way, by id and instance only.
 */
export function useImageListPage({
  listState,
  items,
  count,
  request,
  error,
  loading,
  lightboxRef,
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
    // An `image` param waits for this request's own rows (not a
    // placeholder's), and a failed page drops nothing
    ready: !loading && !error,
    fetchImage: readImage,
  });
  const { openLightbox, consumePendingLightboxIndex, failPendingPage } =
    lightbox;
  // A host's Play Slideshow (a gallery's) opens the viewer from outside. It
  // may ask before the page's rows are in (it opened the tab), and it opens
  // after the lightbox has followed the URL, which on mount closes it.
  const [hostOpen, setHostOpen] = useState<{
    index: number;
    autoPlay: boolean;
  } | null>(null);
  const rowsReady = !loading && !error && items.length > 0;
  useImperativeHandle(
    lightboxRef,
    () => ({
      open: (index, autoPlay = false) => setHostOpen({ index, autoPlay }),
    }),
    []
  );
  useEffect(() => {
    if (hostOpen === null || !rowsReady) return;
    setHostOpen(null);
    openLightbox(hostOpen.index, hostOpen.autoPlay);
  }, [hostOpen, rowsReady, openLightbox]);

  // A crossing's page that fails leaves the list with no rows until the
  // lightbox returns to its page: the open lightbox keeps the last rows
  const [lastRows, setLastRows] = useState(items);
  if (items.length > 0 && items !== lastRows) setLastRows(items);
  const lightboxRows =
    lightbox.lightboxOpen && !!error && items.length === 0 ? lastRows : items;

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
  const cardHandlers = useMemo<CardHandlers>(
    () => ({ onItemClick, onOCounterChange }),
    [onItemClick, onOCounterChange]
  );

  // The viewer's source and preview, each falling back to the image's proxy
  // route when the server sent none
  const lightboxImages = useMemo(
    () => (lightboxRows as unknown as ImageListItem[]).map(viewerImage),
    [lightboxRows]
  );
  const { soloImage, updateSoloImage } = lightbox;
  const soloImages = useMemo(
    () => (soloImage ? [viewerImage(soloImage)] : null),
    [soloImage]
  );

  // The lightbox's own changes, back into the cached page
  const onImagesUpdate = useCallback(
    (updated: ImageListItem[]) =>
      updateCachedPage((rows) =>
        rows.map((row) => {
          const match = updated.find((u) => imageKey(u) === imageKey(row));
          return match ? { ...row, ...match } : row;
        })
      ),
    [updateCachedPage]
  );

  const after = soloImages ? (
    // An address's image from beyond the loaded page, alone: no paging
    <Lightbox
      isOpen={lightbox.lightboxOpen}
      images={soloImages}
      initialIndex={0}
      autoPlay={lightbox.lightboxAutoPlay}
      onClose={lightbox.closeLightbox}
      onImagesUpdate={(updated) => {
        const image = updated[0];
        if (image) updateSoloImage(image);
        onImagesUpdate(updated);
      }}
      transitionKey={lightbox.transitionKey}
    />
  ) : lightboxRows.length > 0 ? (
    <Lightbox
      isOpen={lightbox.lightboxOpen}
      images={lightboxImages}
      initialIndex={lightbox.lightboxIndex}
      autoPlay={lightbox.lightboxAutoPlay}
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

  // The open lightbox covers the list: a failed page is its toast, not the
  // error page (which would unmount it)
  return { cardHandlers, after, holdsPage: lightbox.lightboxOpen };
}
