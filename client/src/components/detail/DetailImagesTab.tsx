/**
 * A detail page's Images tab: the Images list (its sort, filters, search,
 * views, page size and viewer, its state in the URL) locked to the page's
 * entity. The lock is never in the URL, not offered in the filter panel and
 * shows no chip. The tab's presets are its own (`image_<type>`), so the
 * Images page's default preset never applies here and a default saved here
 * never becomes the Images page's.
 */
import type { Ref } from "react";
import EntityListPage from "../list/EntityListPage";
import { IMAGE_LIST, type ListLightbox } from "../list/listPageConfigs";
import type { ViewModeId } from "../list/listViewModes";

/** The image filter's field a detail page locks, by the page's entity */
export type DetailImagesField = "performers" | "studios" | "tags" | "galleries";

/** Each field's preset context */
const PRESET_CONTEXT: Record<DetailImagesField, string> = {
  performers: "image_performer",
  studios: "image_studio",
  tags: "image_tag",
  galleries: "image_gallery",
};

/** A host's handle on the tab's viewer (a gallery's Play Slideshow) */
export type DetailImagesLightbox = ListLightbox;

interface Props {
  /** The image filter's field for the page's entity */
  field: DetailImagesField;
  /** The entity as "id:instanceId" */
  entityRef: string;
  /** -1 under Include sub-tags or sub-studios; left out, the entity only */
  depth?: -1;
  /** What the tab says when the entity has no images */
  emptyMessage: string;
  /**
   * The sort when neither the URL nor a default preset names one, ascending:
   * title (the server's default for images) unless set ("path" is a
   * gallery's file order)
   */
  defaultSort?: string;
  /** The view when neither the URL nor a default preset names one (a gallery's wall) */
  defaultView?: ViewModeId;
  /** Where an image's page says the user came from */
  fromPageTitle?: string;
  /** Set to open the viewer from the host */
  lightboxRef?: Ref<DetailImagesLightbox>;
}

const DetailImagesTab = ({
  field,
  entityRef,
  depth,
  emptyMessage,
  defaultSort,
  defaultView,
  fromPageTitle,
  lightboxRef,
}: Props) => (
  <EntityListPage
    config={IMAGE_LIST}
    embed={{
      context: PRESET_CONTEXT[field],
      permanentFilters: {
        [field]: {
          value: [entityRef],
          modifier: "INCLUDES",
          ...(depth !== undefined ? { depth } : {}),
        },
      },
      defaultSort: defaultSort ?? "title",
      defaultDirection: "ASC",
      ...(defaultView ? { defaultView } : {}),
      emptyMessage,
      // A tab offers no folder view
      folderView: false,
      ...(fromPageTitle !== undefined ? { fromPageTitle } : {}),
      ...(lightboxRef ? { lightboxRef } : {}),
    }}
  />
);

export default DetailImagesTab;
