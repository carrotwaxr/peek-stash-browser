import { useCallback } from "react";

/**
 * A ref for a preview `<video>` that owns its `src`: attaching the element
 * loads `src`, detaching it stops the download. An unmounted video keeps
 * fetching until the browser collects it, so moving across a grid would leave
 * a trail of running downloads.
 *
 * The video takes no `src` prop. React sets a prop only when its value
 * changes, so a src removed on detach would stay removed when the same
 * element is attached again (StrictMode's second ref call, a Suspense
 * boundary revealing its content) and the preview would never load.
 */
export const usePreviewVideoRef = (src: string | null | undefined) =>
  useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video || !src) return;
      video.setAttribute("src", src);
      return () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    },
    [src]
  );
