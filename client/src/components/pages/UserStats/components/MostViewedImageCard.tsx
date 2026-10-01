import { useEffect, useState } from "react";
import type { HighlightImage } from "@peek/shared-types";
import { skipToken, useQuery } from "@tanstack/react-query";
import { getErrorMessage } from "../../../../api";
import { libraryApi } from "../../../../api/library";
import { queryKeys } from "../../../../api/queryKeys";
import { showError } from "../../../../utils/toast";
import Lightbox from "../../../ui/Lightbox";
import HighlightCard from "./HighlightCard";

interface Props {
  image: HighlightImage | null;
}

/**
 * The Most Viewed Image highlight: it opens the image in the viewer on this
 * page. The image is read through the Images list by id on its own instance,
 * so it is the viewer's visible image with their rating, favorite and O count
 * (a hidden or restricted image reads as none); the stats answer carries only
 * its title, thumbnail and view count.
 */
const MostViewedImageCard = ({ image }: Props) => {
  const [opened, setOpened] = useState(false);
  // One read per opening: the image can be hidden or restricted since, or
  // a read that failed can work now. Each opening has its own entry, so it
  // starts with no answer and judges only its own read.
  const [opening, setOpening] = useState(0);
  const imageQuery = useQuery({
    queryKey: [
      ...queryKeys.images.detail(image?.instanceId, image?.id),
      opening,
    ],
    queryFn:
      opened && image
        ? async ({ signal }) => {
            const { findImages } = await libraryApi.findImages(
              {
                ids: [image.id],
                image_filter: { instance_id: image.instanceId },
              },
              signal
            );
            return findImages.images[0] ?? null;
          }
        : skipToken,
    staleTime: 0,
    gcTime: 0,
  });
  const found = imageQuery.data;

  // The image is gone from the viewer's library, or the read failed: say so
  // and show the card again rather than an empty viewer
  const failed = opened && (found === null || imageQuery.isError);
  const failure = imageQuery.error;
  useEffect(() => {
    if (!failed) return;
    showError(
      failure ? getErrorMessage(failure) : "That image is no longer available"
    );
    setOpened(false);
  }, [failed, failure]);

  return (
    <>
      <HighlightCard
        title="Most Viewed Image"
        item={image}
        entityType="image"
        statLabel="views"
        statValue={image?.viewCount ?? 0}
        onOpen={() => {
          setOpening((n) => n + 1);
          setOpened(true);
        }}
        opening={opened && !found}
      />
      {found ? (
        <Lightbox
          isOpen={opened}
          images={[found]}
          onClose={() => setOpened(false)}
        />
      ) : null}
    </>
  );
};

export default MostViewedImageCard;
