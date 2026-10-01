/**
 * A ref for a preview `<video>`: when the element leaves the page it stops its
 * download. An unmounted video keeps fetching until the browser collects it,
 * so moving across a grid would leave a trail of running downloads.
 */
export const releaseVideoOnUnmount = (video: HTMLVideoElement | null) => {
  if (!video) return;
  return () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
};
